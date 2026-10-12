import streamDeck from "@elgato/streamdeck";
import { listSignature, SensorPoller } from "./poller.js";
import { recommend } from "./sensors/thresholds.js";
import type { SensorType } from "./sensors/types.js";
import { formatNumber, type GaugeSettings, type MultiSettings } from "./settings.js";

export const poller = new SensorPoller({
  info: (m) => streamDeck.logger.info(m),
  error: (m) => streamDeck.logger.error(m),
});

const painters = new Map<string, () => Promise<void>>();
const intervals = new Map<string, number>();
const histories = new Map<string, number[]>();
const lastImage = new Map<string, string>();
const gaugeSettings = new Map<string, GaugeSettings>();
const multiSettings = new Map<string, MultiSettings>();
let started = false;

function updateInterval(): void {
  const min = Math.min(...intervals.values());
  poller.setIntervalMs(Number.isFinite(min) ? min : 1000);
}

export function setGauge(id: string, settings: GaugeSettings): void {
  gaugeSettings.set(id, settings);
  intervals.set(id, settings.intervalMs);
  updateInterval();
}
export function getGauge(id: string): GaugeSettings | undefined {
  return gaugeSettings.get(id);
}
export function setMulti(id: string, settings: MultiSettings): void {
  multiSettings.set(id, settings);
  intervals.set(id, settings.intervalMs);
  updateInterval();
}
export function getMulti(id: string): MultiSettings | undefined {
  return multiSettings.get(id);
}
export function history(id: string): number[] {
  return histories.get(id) ?? [];
}
export function setHistory(id: string, value: number[]): void {
  histories.set(id, value);
}
export function registerPainter(id: string, paint: () => Promise<void>): void {
  painters.set(id, paint);
}

export async function ensureStarted(): Promise<void> {
  if (started) return;
  started = true;
  await poller.start();
}

export async function release(id: string): Promise<void> {
  painters.delete(id);
  intervals.delete(id);
  histories.delete(id);
  lastImage.delete(id);
  gaugeSettings.delete(id);
  multiSettings.delete(id);
  if (intervals.size === 0) {
    started = false;
    await poller.stop();
    return;
  }
  updateInterval();
}

export async function paintAll(): Promise<void> {
  await Promise.all(
    [...painters.values()].map((paint) => paint().catch((e: unknown) => streamDeck.logger.error(e instanceof Error ? e.message : String(e)))),
  );
}

/** Sets the key image only when the SVG actually changed. */
export async function setImageIfChanged(id: string, svg: string, set: (image: string) => Promise<void>): Promise<void> {
  if (lastImage.get(id) === svg) return;
  lastImage.set(id, svg);
  await set(`data:image/svg+xml,${encodeURIComponent(svg)}`);
}

const ORDER: SensorType[] = ["temp", "fan", "volt", "curr", "pwr", "duty", "sys", "other"];
const GROUPS: Record<SensorType, string> = {
  temp: "Temperature",
  fan: "Cooling",
  volt: "Voltage",
  curr: "Current",
  pwr: "Power",
  duty: "Duty cycle",
  sys: "System",
  other: "Other",
};

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
        return { label: `${s.label} — ${value}${rec.unit ? ` ${rec.unit}` : ""}`, value: String(s.key) };
      });
    return children.length ? [{ label: GROUPS[type], children }] : [];
  });
}

let inspectorVisible = false;
let lastPushedSignature = "";

export function setInspectorVisible(visible: boolean): void {
  inspectorVisible = visible;
}

/**
 * Sends the sensor list to the visible inspector. Called when the inspector
 * appears and when it asks (getSensors). It is NOT sent on every poll: that
 * rebuilt the dropdown and closed it while the user was choosing.
 */
export async function pushSensorList(): Promise<void> {
  if (!inspectorVisible || !streamDeck.ui.action) return;
  lastPushedSignature = listSignature(poller.snapshot);
  try {
    await streamDeck.ui.sendToPropertyInspector({ event: "getSensors", items: sensorItems() });
  } catch (error) {
    streamDeck.logger.error(`Could not send sensor list: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * After a poll, refresh the inspector list only if the set of sensors changed
 * (e.g. AIDA64 just started). Value changes alone never trigger a push.
 */
export async function pushIfListChanged(): Promise<void> {
  if (!inspectorVisible) return;
  if (listSignature(poller.snapshot) === lastPushedSignature) return;
  await pushSensorList();
}
