import { DEFAULT_ZONES, type Gradient, type Palette, type ZoneColours, validHex } from "./colour.js";
import { isNeutral, recommend } from "./sensors/thresholds.js";
import type { GaugeStyle, Sensor } from "./sensors/types.js";

export const THEME = {
  neutral: "#d7dbe3",
  track: "#2c313a",
  bg: "#101114",
  fg: "#f4f6f8",
  muted: "#a8b0bc",
  off: "#8b93a0",
} as const;

export const MIN_INTERVAL = 250;
export const MAX_INTERVAL = 5000;

export type ColorMode = "threshold" | "solid";
export type Background = "heat" | "steady";

/** Colour options shared by every action. Stored per key. */
export interface ColourSettings {
  palette: Palette;
  gradient: Gradient;
  colCold: string;
  colNormal: string;
  colHigh: string;
  colCrit: string;
}

export interface GaugeSettings extends ColourSettings {
  sensorKey: string;
  style: GaugeStyle;
  label: string;
  unit: string;
  decimals: number;
  min: number;
  max: number;
  cold: number | null;
  warn: number | null;
  crit: number | null;
  colorMode: ColorMode;
  background: Background;
  solid: string;
  intervalMs: number;
  showLabel: boolean;
}

export interface MultiSlot {
  sensorKey: string;
  label: string;
}

export interface MultiSettings extends ColourSettings {
  count: 2 | 3 | 4;
  slots: MultiSlot[];
  decimals: number;
  intervalMs: number;
  colorMode: ColorMode;
  background: Background;
  solid: string;
}

const STYLES = new Set<GaugeStyle>(["radial", "bar", "value", "sparkline"]);

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === "object" ? (v as Loose) : {});
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}
function optNum(v: unknown, fallback: number | null): number | null {
  if (v === null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}
const decimals = (v: unknown, fallback: number) => Math.max(0, Math.min(3, Math.round(num(v, fallback))));

export function clampInterval(value: number): number {
  const v = Number.isFinite(value) ? value : 1000;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(v)));
}

export function formatNumber(value: number, places: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(Math.max(0, Math.min(3, Math.round(places))));
}

export function defaultColours(): ColourSettings {
  return {
    palette: "default",
    gradient: "smooth",
    colCold: DEFAULT_ZONES.cold,
    colNormal: DEFAULT_ZONES.normal,
    colHigh: DEFAULT_ZONES.high,
    colCrit: DEFAULT_ZONES.crit,
  };
}

export function parseColours(raw: unknown): ColourSettings {
  const n = obj(raw);
  const d = defaultColours();
  const palette = str(n.palette);
  const gradient = str(n.gradient);
  return {
    palette: palette === "colourblind" || palette === "custom" ? palette : "default",
    gradient: gradient === "stepped" ? "stepped" : "smooth",
    colCold: validHex(n.colCold) ?? d.colCold,
    colNormal: validHex(n.colNormal) ?? d.colNormal,
    colHigh: validHex(n.colHigh) ?? d.colHigh,
    colCrit: validHex(n.colCrit) ?? d.colCrit,
  };
}

export function customZones(c: ColourSettings): Partial<ZoneColours> {
  return { cold: c.colCold, normal: c.colNormal, high: c.colHigh, crit: c.colCrit };
}

export function defaultGauge(sensorKey = ""): GaugeSettings {
  return {
    sensorKey,
    style: "radial",
    label: "",
    unit: "",
    decimals: 0,
    min: 0,
    max: 100,
    cold: null,
    warn: 70,
    crit: 90,
    colorMode: "threshold",
    background: "heat",
    solid: THEME.neutral,
    intervalMs: 1000,
    showLabel: true,
    ...defaultColours(),
  };
}

export function parseGauge(raw: unknown): GaugeSettings {
  const d = defaultGauge();
  const n = obj(raw);
  const style = str(n.style) as GaugeStyle;
  const mode = str(n.colorMode);
  return {
    sensorKey: str(n.sensorKey),
    style: STYLES.has(style) ? style : d.style,
    label: str(n.label),
    unit: str(n.unit),
    decimals: decimals(n.decimals, d.decimals),
    min: num(n.min, d.min),
    max: num(n.max, d.max),
    cold: optNum(n.cold, null),
    warn: optNum(n.warn, d.warn),
    crit: optNum(n.crit, d.crit),
    colorMode: mode === "solid" || mode === "threshold" ? mode : d.colorMode,
    background: n.background === "steady" ? "steady" : "heat",
    solid: str(n.solid, d.solid) || d.solid,
    intervalMs: clampInterval(num(n.intervalMs, d.intervalMs)),
    showLabel: n.showLabel !== false,
    ...parseColours(n),
  };
}

/**
 * Applies per-sensor defaults (scale, unit, zones) when the user picks a new
 * sensor. Display preferences and colours are kept. The user can then override
 * any value in the inspector.
 */
export function applyRecommendation(sensor: Sensor, previous: GaugeSettings): GaugeSettings {
  const rec = recommend(sensor);
  return {
    ...previous,
    sensorKey: sensor.key,
    style: rec.style,
    label: "",
    unit: rec.unit,
    decimals: rec.decimals,
    min: rec.min,
    max: rec.max === rec.min ? rec.min + 1 : rec.max,
    cold: rec.cold,
    warn: rec.warn,
    crit: rec.crit,
    colorMode: isNeutral(rec) ? "solid" : "threshold",
  };
}

export function defaultMulti(): MultiSettings {
  return {
    count: 2,
    slots: [0, 1, 2, 3].map(() => ({ sensorKey: "", label: "" })),
    decimals: 0,
    intervalMs: 1000,
    colorMode: "threshold",
    background: "heat",
    solid: THEME.neutral,
    ...defaultColours(),
  };
}

export function parseMulti(raw: unknown): MultiSettings {
  const d = defaultMulti();
  const n = obj(raw);
  const count = num(n.count, d.count);
  const slots = Array.isArray(n.slots) ? n.slots : [];
  const mode = str(n.colorMode);
  return {
    count: count === 3 || count === 4 ? count : 2,
    slots: [0, 1, 2, 3].map((i) => {
      const slot = obj(slots[i]);
      return { sensorKey: str(n[`slot${i}`]) || str(slot.sensorKey), label: str(n[`slotLabel${i}`]) || str(slot.label) };
    }),
    decimals: decimals(n.decimals, d.decimals),
    intervalMs: clampInterval(num(n.intervalMs, d.intervalMs)),
    colorMode: mode === "solid" ? "solid" : "threshold",
    background: n.background === "steady" ? "steady" : "heat",
    solid: str(n.solid, d.solid) || d.solid,
    ...parseColours(n),
  };
}
