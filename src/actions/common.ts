import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { anchors, zoneOf } from "../colour.js";
import { alert, getGlobals, peek, poller, previewValue, sample, setImageIfChanged } from "../hub.js";
import { migrateSettings } from "../migrate.js";
import { openAida64 } from "../platform.js";
import { render } from "../render.js";
import type { Sensor } from "../sensors/types.js";
import { type GaugeSettings, resolveAppearance } from "../settings.js";
import { findSensor, gaugeView } from "../view.js";

/**
 * Migrates stored settings from 1.0 / 1.1 and writes them back once, so the
 * inspector shows the upgraded values. Returns the migrated raw object.
 */
export async function migrateOnAppear(action: { setSettings(s: JsonObject): Promise<void>; id: string }, raw: JsonObject): Promise<JsonObject> {
  const { settings, from, changed } = migrateSettings(raw);
  if (changed) {
    streamDeck.logger.info(`Migrated settings of ${action.id} from ${from}`);
    await action.setSettings(settings as JsonObject);
  }
  return settings as JsonObject;
}

/** Values that show each zone once, for "Preview warning colours". */
export function previewValues(s: Pick<GaugeSettings, "min" | "max" | "cold" | "warn" | "crit">): number[] {
  const a = anchors(s);
  if (!a) return [s.min, (s.min + s.max) / 2, s.max];
  const [cold, normal, high, crit] = a.map((x) => x.value) as [number, number, number, number];
  const below = cold - Math.abs(normal - cold) * 0.5;
  return [below, normal, (high + crit) / 2, crit + Math.abs(crit - high) * 0.5];
}

/** Shared painter for every gauge-like key (Gauge, presets, Formula). */
export async function paintGauge(key: KeyAction<JsonObject>, settings: GaugeSettings, sensor: Sensor | undefined, target: string, fresh: boolean): Promise<void> {
  const app = resolveAppearance(settings, getGlobals());
  const span = settings.max - settings.min;
  const rt = fresh ? sample(key.id, target, sensor?.numeric ?? null, settings.smoothing, span) : peek(key.id, span, target, sensor?.numeric ?? null);
  if (fresh && settings.alertLevel !== "off") {
    const zone = zoneOf(rt.value, settings);
    rt.flash = alert(key.id, { level: settings.alertLevel, flash: settings.alertFlash, sound: settings.alertSound, confirm: 2, soundCooldownMs: 30_000 }, zone).flashOn;
  }
  const view = gaugeView(settings, app, poller.snapshot, rt, sensor, target, { preview: previewValue(key.id) });
  await setImageIfChanged(key.id, render(view), (image) => key.setImage(image));
}

export function sensorFor(target: string): Sensor | undefined {
  return findSensor(poller.snapshot, target);
}

/** Opens AIDA64 and gives key feedback per the SDK guidelines (showOk / showAlert). */
export async function pressOpenAida(key: KeyAction<JsonObject>): Promise<void> {
  if (openAida64(getGlobals().aidaPath)) await key.showOk();
  else await key.showAlert();
}

/** Next sensor of the same type, for the "cycle sensor" key press. */
export function nextSensorOfType(current: string): Sensor | undefined {
  const list = poller.snapshot.sensors;
  const now = findSensor(poller.snapshot, current);
  const pool = now ? list.filter((s) => s.type === now.type) : list;
  if (!pool.length) return undefined;
  const i = now ? pool.findIndex((s) => s.key === now.key) : -1;
  return pool[(i + 1) % pool.length];
}
