import streamDeck from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { newAlertState, stepAlert, type AlertOutcome, type AlertConfig } from "./alerts.js";
import type { Zone } from "./colour.js";
import { runSnapshotHooks } from "./hooks.js";
import { playAlertSound } from "./platform.js";
import { listSignature, SensorPoller } from "./poller.js";
import { recommend } from "./sensors/thresholds.js";
import type { SensorType } from "./sensors/types.js";
import { defaultGlobal, formatNumber, type GlobalSettings, parseGlobal } from "./settings.js";
import { SensorStats, trendOf } from "./stats.js";
import type { Runtime } from "./view.js";

export const poller = new SensorPoller({
  info: (m) => streamDeck.logger.info(m),
  error: (m) => streamDeck.logger.error(m),
});

// ---- global settings ---------------------------------------------------------

let globals: GlobalSettings = defaultGlobal();
export const getGlobals = (): GlobalSettings => globals;

export async function loadGlobals(): Promise<void> {
  try {
    globals = parseGlobal(await streamDeck.settings.getGlobalSettings());
  } catch {
    globals = defaultGlobal();
  }
}
export function setGlobals(raw: JsonObject): void {
  globals = parseGlobal(raw);
}

// ---- per-key registry --------------------------------------------------------

interface KeyState {
  paint: (fresh: boolean) => Promise<void>;
  interval: number;
  stats: SensorStats;
  statsKey: string;
  alert: ReturnType<typeof newAlertState>;
  lastImage?: string;
  preview?: { until: number; values: number[]; started: number };
}

const keys = new Map<string, KeyState>();
let started = false;

function updateInterval(): void {
  const min = Math.min(...[...keys.values()].map((k) => k.interval));
  poller.setIntervalMs(Number.isFinite(min) ? min : 1000);
}

export function register(id: string, paint: (fresh: boolean) => Promise<void>, interval: number): void {
  const existing = keys.get(id);
  keys.set(id, existing ? { ...existing, paint, interval } : { paint, interval, stats: new SensorStats(), statsKey: "", alert: newAlertState() });
  updateInterval();
}

export function setKeyInterval(id: string, interval: number): void {
  const k = keys.get(id);
  if (k) k.interval = interval;
  updateInterval();
}

export async function ensureStarted(): Promise<void> {
  if (started) return;
  started = true;
  await poller.start();
}

export async function release(id: string): Promise<void> {
  keys.delete(id);
  if (keys.size === 0) {
    started = false;
    await poller.stop();
    return;
  }
  updateInterval();
}

/**
 * Feeds one sample into a key's statistics and returns its runtime values.
 * Statistics reset when the key switches to another sensor.
 */
export function sample(id: string, sensorKey: string, raw: number | null, smoothing: number, span: number): Runtime {
  const k = keys.get(id);
  if (!k) return { value: raw, history: [], min: null, max: null, trend: null, flash: false };
  if (k.statsKey !== sensorKey) {
    k.stats.reset();
    k.statsKey = sensorKey;
  }
  const value = k.stats.push(raw, smoothing);
  return { value, history: [...k.stats.history], min: k.stats.min, max: k.stats.max, trend: trendOf(k.stats.history, span), flash: false };
}

/** Last runtime values without adding a sample (for repaints caused by settings changes). */
export function peek(id: string, span: number, sensorKey?: string, raw: number | null = null): Runtime {
  const k = keys.get(id);
  if (!k || (sensorKey !== undefined && k.statsKey !== sensorKey)) return { value: raw, history: [], min: null, max: null, trend: null, flash: false };
  return { value: k.stats.history.at(-1) ?? null, history: [...k.stats.history], min: k.stats.min, max: k.stats.max, trend: trendOf(k.stats.history, span), flash: false };
}

export function resetMinMax(id: string): void {
  keys.get(id)?.stats.resetMinMax();
}

export function alert(id: string, cfg: AlertConfig, zone: Zone | null): AlertOutcome {
  const k = keys.get(id);
  if (!k) return { active: false, started: false, flashOn: false, playSound: false };
  const out = stepAlert(k.alert, cfg, zone, Date.now());
  if (out.started) streamDeck.logger.info(`Alert on ${id} (${zone})`);
  if (out.playSound) playAlertSound();
  return out;
}

// ---- preview -----------------------------------------------------------------

/** Starts "preview warning colours": the key steps through the given values, 1 s each. */
export function startPreview(id: string, values: number[]): void {
  const k = keys.get(id);
  if (!k) return;
  const now = Date.now();
  k.preview = { started: now, until: now + values.length * 1000, values };
  const tick = () => {
    void k.paint(false);
    if (k.preview && Date.now() < k.preview.until) setTimeout(tick, 250);
    else {
      k.preview = undefined;
      void k.paint(false);
    }
  };
  tick();
}

export function previewValue(id: string): number | null {
  const p = keys.get(id)?.preview;
  if (!p || Date.now() >= p.until) return null;
  return p.values[Math.min(p.values.length - 1, Math.floor((Date.now() - p.started) / 1000))] ?? null;
}

// ---- painting ----------------------------------------------------------------

export async function paintAll(): Promise<void> {
  runSnapshotHooks(poller.snapshot);
  await Promise.all(
    [...keys.values()].map((k) => k.paint(true).catch((e: unknown) => streamDeck.logger.error(e instanceof Error ? e.message : String(e)))),
  );
}

/** Sends a new image only when the SVG changed (polling is ≥ 250 ms, well under 10 updates/s). */
export async function setImageIfChanged(id: string, svg: string, set: (image: string) => Promise<void>): Promise<void> {
  const k = keys.get(id);
  if (k?.lastImage === svg) return;
  if (k) k.lastImage = svg;
  await set(`data:image/svg+xml,${encodeURIComponent(svg)}`);
}

export function forgetImage(id: string): void {
  const k = keys.get(id);
  if (k) k.lastImage = undefined;
}

// ---- inspector ---------------------------------------------------------------

const ORDER: SensorType[] = ["temp", "fan", "volt", "curr", "pwr", "duty", "sys", "other"];
const GROUPS: Record<SensorType, string> = { temp: "Temperature", fan: "Cooling", volt: "Voltage", curr: "Current", pwr: "Power", duty: "Duty cycle", sys: "System", other: "Other" };
const SOURCES: Record<string, string> = { "shared-memory": "Shared memory", wmi: "WMI", registry: "Registry", file: "File", script: "Script", "lm-sensors": "lm-sensors (Linux)", none: "None", aida64: "AIDA64" };

type Item = { label: string; value: string; disabled?: boolean } | { label: string; children: { label: string; value: string }[] };

/** Data source items for sdpi-select (datasource="getSensors"). */
export function sensorItems(): Item[] {
  const snap = poller.snapshot;
  if (!snap.sensors.length) {
    const label = snap.phase === "not-running" ? "AIDA64 is not running" : snap.phase === "sharing-off" ? "Sharing is off in AIDA64" : snap.detail || "No sensors yet";
    return [{ label, value: "", disabled: true }];
  }
  return ORDER.flatMap((type) => {
    const children = snap.sensors
      .filter((s) => s.type === type)
      .map((s) => {
        const rec = recommend(s);
        const value = s.numeric === null ? s.raw : formatNumber(s.numeric, rec.decimals);
        return { label: `${s.label} — ${value}${rec.unit ? ` ${rec.unit}` : ""} [${s.id}]`, value: String(s.key) };
      });
    return children.length ? [{ label: GROUPS[type], children }] : [];
  });
}

/** Status line for the inspector: phase, active source (shared memory / WMI / registry) and count. */
export function statusPayload(extra: Record<string, string> = {}): JsonObject {
  const snap = poller.snapshot;
  return { event: "status", phase: snap.phase, source: SOURCES[snap.source] ?? snap.source, detail: snap.detail, count: snap.sensors.length, slow: poller.currentInterval() > 1000 && snap.phase !== "live", ...extra };
}

let inspectorVisible = false;
let lastPushedSignature = "";

export function setInspectorVisible(visible: boolean): void {
  inspectorVisible = visible;
}

/**
 * Sends the sensor list to the visible inspector. Called when the inspector
 * appears and when it asks (getSensors). Not sent on every poll: that rebuilt
 * the dropdown and closed it while the user was choosing.
 */
export async function pushSensorList(): Promise<void> {
  if (!inspectorVisible || !streamDeck.ui.action) return;
  lastPushedSignature = listSignature(poller.snapshot);
  try {
    await streamDeck.ui.sendToPropertyInspector({ event: "getSensors", items: sensorItems() });
    await streamDeck.ui.sendToPropertyInspector(statusPayload());
  } catch (error) {
    streamDeck.logger.error(`Could not send sensor list: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function pushStatus(extra: Record<string, string> = {}): Promise<void> {
  if (!inspectorVisible || !streamDeck.ui.action) return;
  try {
    await streamDeck.ui.sendToPropertyInspector(statusPayload(extra));
  } catch {
    /* inspector closed */
  }
}

let lastStatus = "";

/** After a poll: refresh the list only if the set of sensors changed, and the status if it changed. */
export async function afterPoll(): Promise<void> {
  if (!inspectorVisible) return;
  if (listSignature(poller.snapshot) !== lastPushedSignature) return pushSensorList();
  const status = JSON.stringify(statusPayload());
  if (status !== lastStatus) {
    lastStatus = status;
    await pushStatus();
  }
}
