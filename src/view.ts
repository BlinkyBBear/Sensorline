import { colourFor, heat, type Zone, zoneOf, type Zones } from "./colour.js";
import { recommend } from "./sensors/thresholds.js";
import type { Sensor, Snapshot } from "./sensors/types.js";
import { formatNumber, type GaugeSettings, type MultiSettings, type ResolvedAppearance } from "./settings.js";
import type { Trend } from "./stats.js";
import { TEXT_SCALE, type Theme, theme as themeFor, tintedBackground } from "./theme.js";

export interface SlotView {
  title: string;
  valueText: string;
  unit: string;
  fraction: number | null;
  color: string;
  zone: Zone | null;
}

export interface KeyView {
  style: "status" | "multi" | "radial" | "bar" | "value" | "sparkline";
  title: string;
  valueText: string;
  unit: string;
  fraction: number | null;
  color: string;
  background: string;
  /** 0..1 fractions for the sparkline. */
  history: number[];
  message?: string;
  /** Short setup steps shown on the key when there is no data. */
  steps?: string[];
  slots?: SlotView[];
  zone: Zone | null;
  trend: Trend | null;
  /** "↓31 ↑85" when min/max hold is on. */
  minmax?: string;
  theme: Theme;
  scale: number;
  showZoneGlyph: boolean;
  /** Key is flashing (alert) on this frame. */
  flash: boolean;
}

/** Runtime values for one key, computed by the action from SensorStats and alerts. */
export interface Runtime {
  value: number | null;
  history: number[];
  min: number | null;
  max: number | null;
  trend: Trend | null;
  flash: boolean;
}

export const emptyRuntime = (): Runtime => ({ value: null, history: [], min: null, max: null, trend: null, flash: false });

export function fraction(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(min) || !Number.isFinite(max) || max === min) return null;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function findSensor(snapshot: Snapshot, key: string): Sensor | undefined {
  if (!key) return undefined;
  const upper = key.toUpperCase();
  return snapshot.sensors.find((s) => s.key === key || s.id === key) ?? snapshot.sensors.find((s) => s.id.toUpperCase() === upper);
}

export function truncate(text: string, length = 18): string {
  const t = text.trim();
  return t.length <= length ? t : `${t.slice(0, length - 1)}…`;
}

function base(app: ResolvedAppearance): Pick<KeyView, "theme" | "scale" | "showZoneGlyph" | "flash" | "zone" | "trend" | "history"> {
  return { theme: themeFor(app.theme), scale: TEXT_SCALE[app.textSize], showZoneGlyph: app.showZoneGlyph, flash: false, zone: null, trend: null, history: [] };
}

function status(app: ResolvedAppearance, title: string, message: string, steps?: string[]): KeyView {
  const b = base(app);
  return { ...b, style: "status", title, valueText: "", unit: "", fraction: null, color: b.theme.off, background: b.theme.bg, message, steps };
}

/**
 * On-key helping hand: what is wrong, and the next steps, in lines short
 * enough to read on a 72 px key.
 */
export function statusView(snapshot: Snapshot, app: ResolvedAppearance): KeyView | null {
  switch (snapshot.phase) {
    case "live":
      return null;
    case "not-running":
      return status(app, "AIDA64 off", "", ["Start AIDA64", "Extreme"]);
    case "sharing-off":
      return status(app, "Not shared", "", ["Prefs › HW Monitor", "External Apps", "Tick shared mem"]);
    case "backend-missing":
      if (snapshot.source === "none" && snapshot.detail === "Starting…") return status(app, "Sensorline", "Starting…");
      return status(app, "No source", truncate(snapshot.detail, 36));
    default:
      return status(app, "Read error", truncate(snapshot.detail || "Sensor read failed", 36), ["Press to retry"]);
  }
}

function valueText(sensor: Sensor, value: number | null, places: number, unit: string): { valueText: string; unit: string } {
  if (sensor.numeric === null || value === null) return { valueText: truncate(sensor.raw, 12), unit: "" };
  return { valueText: formatNumber(value, places), unit: unit || sensor.unit || recommend(sensor).unit };
}

export function arcColour(value: number | null, zones: Zones, app: ResolvedAppearance, mode: "threshold" | "solid", solid: string): string {
  const t = themeFor(app.theme);
  if (mode === "solid") return app.theme === "high-contrast" ? t.neutral : solid || t.neutral;
  return colourFor(value, zones, app.colours, app.gradient) ?? t.neutral;
}

export function backgroundColour(value: number | null, zones: Zones, app: ResolvedAppearance, background: "heat" | "steady"): string {
  const t = themeFor(app.theme);
  if (background === "steady") return t.bg;
  return tintedBackground(t, colourFor(value, zones, app.colours, app.gradient));
}

function minmaxText(rt: Runtime, places: number): string | undefined {
  if (rt.min === null || rt.max === null) return undefined;
  return `↓${formatNumber(rt.min, places)} ↑${formatNumber(rt.max, places)}`;
}

export interface GaugeOptions {
  /** Show this value instead of the live one (used by "Preview warning colours"). */
  preview?: number | null;
}

export function gaugeView(settings: GaugeSettings, app: ResolvedAppearance, snapshot: Snapshot, rt: Runtime, sensor: Sensor | undefined, target: string, opts: GaugeOptions = {}): KeyView {
  const s = statusView(snapshot, app);
  if (s) return s;
  if (!target) return status(app, "Choose sensor", "Open the inspector");
  if (!sensor) return status(app, "Missing", truncate(target, 18), ["Check the ID or", "AIDA64 sharing"]);
  const rec = recommend(sensor);
  const min = Number.isFinite(settings.min) ? settings.min : rec.min;
  const max = Number.isFinite(settings.max) ? settings.max : rec.max;
  const places = Number.isFinite(settings.decimals) ? settings.decimals : rec.decimals;
  const preview = opts.preview !== undefined && opts.preview !== null;
  const value = preview ? opts.preview! : rt.value ?? sensor.numeric;
  const text = valueText(sensor, value, places, settings.unit || rec.unit);
  const style = sensor.numeric === null ? "value" : settings.style;
  const zones: Zones = { min, max, cold: settings.cold, warn: settings.warn, crit: settings.crit };
  const zone = settings.colorMode === "threshold" ? zoneOf(value, zones) : null;
  const color = arcColour(value, zones, app, settings.colorMode, settings.solid);
  const b = base(app);
  const flash = !preview && rt.flash;
  return {
    ...b,
    style,
    title: settings.showLabel === false ? "" : truncate(settings.label || sensor.label, 14),
    valueText: text.valueText,
    unit: text.unit,
    fraction: fraction(value, min, max),
    color,
    background: flash ? app.colours.crit : backgroundColour(value, zones, app, settings.background),
    history: style === "sparkline" ? rt.history.map((v) => fraction(v, min, max) ?? 0) : [],
    zone,
    trend: app.showTrend && !preview ? rt.trend : null,
    minmax: settings.holdMinMax && !preview ? minmaxText(rt, places) : undefined,
    flash,
  };
}

function slotView(slot: { sensorKey: string; label: string }, settings: MultiSettings, app: ResolvedAppearance, snapshot: Snapshot): SlotView {
  const t = themeFor(app.theme);
  const sensor = findSensor(snapshot, slot.sensorKey);
  if (!sensor) return { title: truncate(slot.label || slot.sensorKey || "Empty", 8), valueText: "—", unit: "", fraction: null, color: t.off, zone: null };
  const rec = recommend(sensor);
  const text = valueText(sensor, sensor.numeric, settings.decimals || rec.decimals, "");
  return {
    title: truncate(slot.label || sensor.label, 8),
    valueText: text.valueText,
    unit: text.unit,
    fraction: fraction(sensor.numeric, rec.min, rec.max),
    color: arcColour(sensor.numeric, rec, app, settings.colorMode, settings.solid),
    zone: settings.colorMode === "threshold" ? zoneOf(sensor.numeric, rec) : null,
  };
}

export function multiView(settings: MultiSettings, app: ResolvedAppearance, snapshot: Snapshot): KeyView {
  const s = statusView(snapshot, app);
  if (s) return s;
  const b = base(app);
  const active = settings.slots.slice(0, settings.count);
  let background: string = b.theme.bg;
  if (settings.background !== "steady") {
    let hottest = -1;
    for (const slot of active) {
      const sensor = findSensor(snapshot, slot.sensorKey);
      if (!sensor) continue;
      const rec = recommend(sensor);
      const h = heat(sensor.numeric, rec);
      if (h > hottest) {
        hottest = h;
        background = backgroundColour(sensor.numeric, rec, app, "heat");
      }
    }
  }
  return { ...b, style: "multi", title: "", valueText: "", unit: "", fraction: null, color: b.theme.neutral, background, slots: active.map((slot) => slotView(slot, settings, app, snapshot)) };
}
