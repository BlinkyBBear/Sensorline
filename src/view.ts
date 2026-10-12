import { backgroundShade, colourFor, heat, zoneColours, type Zones } from "./colour.js";
import { recommend } from "./sensors/thresholds.js";
import type { Sensor, Snapshot } from "./sensors/types.js";
import { type ColourSettings, customZones, formatNumber, type GaugeSettings, type MultiSettings, THEME } from "./settings.js";

export interface SlotView {
  title: string;
  valueText: string;
  unit: string;
  fraction: number | null;
  color: string;
}

export interface KeyView {
  style: "status" | "multi" | "radial" | "bar" | "value" | "sparkline";
  title: string;
  valueText: string;
  unit: string;
  fraction: number | null;
  color: string;
  background: string;
  history: number[];
  message?: string;
  slots?: SlotView[];
}

export function fraction(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(min) || !Number.isFinite(max) || max === min) return null;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function findSensor(snapshot: Snapshot, key: string): Sensor | undefined {
  if (!key) return undefined;
  return snapshot.sensors.find((s) => s.key === key || s.id === key);
}

export function truncate(text: string, length = 18): string {
  const t = text.trim();
  return t.length <= length ? t : `${t.slice(0, length - 1)}…`;
}

function status(title: string, message: string): KeyView {
  return { style: "status", title, valueText: "", unit: "", fraction: null, color: THEME.off, background: THEME.bg, history: [], message };
}

export function statusView(snapshot: Snapshot): KeyView | null {
  switch (snapshot.phase) {
    case "live":
      return null;
    case "not-running":
      return status("AIDA64 off", "Start AIDA64 Extreme");
    case "sharing-off":
      return status("Not sharing", "Enable external applications");
    case "backend-missing":
      return status("No source", truncate(snapshot.detail, 42));
    default:
      return status("Read error", truncate(snapshot.detail || "Sensor read failed", 42));
  }
}

function valueText(sensor: Sensor, places: number, unit: string): { valueText: string; unit: string } {
  if (sensor.numeric === null) return { valueText: truncate(sensor.raw, 12), unit: "" };
  return { valueText: formatNumber(sensor.numeric, places), unit: unit || sensor.unit || recommend(sensor).unit };
}

/** Arc / bar colour for a value given zones and colour settings. */
export function arcColour(value: number | null, zones: Zones, colours: ColourSettings, mode: "threshold" | "solid", solid: string): string {
  if (mode === "solid") return solid || THEME.neutral;
  return colourFor(value, zones, zoneColours(colours.palette, customZones(colours)), colours.gradient) ?? THEME.neutral;
}

/** Key background: a dark shade of the zone colour, or the steady theme background. */
export function backgroundColour(value: number | null, zones: Zones, colours: ColourSettings, background: "heat" | "steady"): string {
  if (background === "steady") return THEME.bg;
  const c = colourFor(value, zones, zoneColours(colours.palette, customZones(colours)), colours.gradient);
  return c ? backgroundShade(c) : THEME.bg;
}

export function gaugeView(settings: GaugeSettings, snapshot: Snapshot, history: number[]): KeyView {
  const s = statusView(snapshot);
  if (s) return s;
  if (!settings.sensorKey) return status("Choose sensor", "Open the inspector");
  const sensor = findSensor(snapshot, settings.sensorKey);
  if (!sensor) return status("Missing", truncate(settings.sensorKey, 22));
  const rec = recommend(sensor);
  const min = Number.isFinite(settings.min) ? settings.min : rec.min;
  const max = Number.isFinite(settings.max) ? settings.max : rec.max;
  const places = Number.isFinite(settings.decimals) ? settings.decimals : rec.decimals;
  const text = valueText(sensor, places, settings.unit || rec.unit);
  const style = sensor.numeric === null ? "value" : settings.style;
  const zones: Zones = { min, max, cold: settings.cold, warn: settings.warn, crit: settings.crit };
  return {
    style,
    title: settings.showLabel === false ? "" : truncate(settings.label || sensor.label),
    valueText: text.valueText,
    unit: text.unit,
    fraction: fraction(sensor.numeric, min, max),
    color: arcColour(sensor.numeric, zones, settings, settings.colorMode, settings.solid),
    background: backgroundColour(sensor.numeric, zones, settings, settings.background),
    history: style === "sparkline" ? history : [],
  };
}

function slotView(slot: { sensorKey: string; label: string }, settings: MultiSettings, snapshot: Snapshot): SlotView {
  const sensor = findSensor(snapshot, slot.sensorKey);
  if (!sensor) return { title: truncate(slot.label || slot.sensorKey || "Empty", 14), valueText: "—", unit: "", fraction: null, color: THEME.off };
  const rec = recommend(sensor);
  const text = valueText(sensor, settings.decimals || rec.decimals, "");
  return {
    title: truncate(slot.label || sensor.label, 14),
    valueText: text.valueText,
    unit: text.unit,
    fraction: fraction(sensor.numeric, rec.min, rec.max),
    color: arcColour(sensor.numeric, rec, settings, settings.colorMode, settings.solid),
  };
}

export function multiView(settings: MultiSettings, snapshot: Snapshot): KeyView {
  const s = statusView(snapshot);
  if (s) return s;
  const active = settings.slots.slice(0, settings.count);
  let background: string = THEME.bg;
  if (settings.background !== "steady") {
    let hottest = -1;
    for (const slot of active) {
      const sensor = findSensor(snapshot, slot.sensorKey);
      if (!sensor) continue;
      const rec = recommend(sensor);
      const h = heat(sensor.numeric, rec);
      if (h > hottest) {
        hottest = h;
        background = backgroundColour(sensor.numeric, rec, settings, "heat");
      }
    }
  }
  return {
    style: "multi",
    title: "",
    valueText: "",
    unit: "",
    fraction: null,
    color: THEME.neutral,
    background,
    history: [],
    slots: active.map((slot) => slotView(slot, settings, snapshot)),
  };
}

export function pushHistory(history: number[], value: number | null, length = 36): number[] {
  if (value === null) return history;
  const next = history.length >= length ? history.slice(history.length - length + 1) : history.slice();
  next.push(value);
  return next;
}
