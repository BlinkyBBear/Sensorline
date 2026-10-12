import { DEFAULT_ZONES, type Gradient, type Palette, type ZoneColours, validHex, zoneColours } from "./colour.js";
import { isNeutral, recommend } from "./sensors/thresholds.js";
import type { GaugeStyle, Sensor } from "./sensors/types.js";
import type { AlertLevel } from "./alerts.js";
import { type TextSize, type ThemeName, THEMES } from "./theme.js";

/** Settings schema version written by this release (1.2). 1.0 had none; 1.1 had none but had `palette`. */
export const SCHEMA = 3;

export const MIN_INTERVAL = 250;
export const MAX_INTERVAL = 5000;

export type ColorMode = "threshold" | "solid";
export type Background = "heat" | "steady";
export type Inherit<T> = T | "inherit";
export type PressAction = "refresh" | "cycle" | "reset" | "open-aida64";

/** Plugin-wide defaults (global settings). Keys set to "inherit" use these. */
export interface GlobalSettings {
  palette: Palette;
  gradient: Gradient;
  theme: ThemeName;
  textSize: TextSize;
  colCold: string;
  colNormal: string;
  colHigh: string;
  colCrit: string;
  /** Optional path to aida64.exe for the "Open AIDA64" key press. */
  aidaPath: string;
}

/** Appearance options shared by every action. */
export interface Appearance {
  palette: Inherit<Palette>;
  gradient: Inherit<Gradient>;
  theme: Inherit<ThemeName>;
  textSize: Inherit<TextSize>;
  colCold: string;
  colNormal: string;
  colHigh: string;
  colCrit: string;
  showZoneGlyph: boolean;
  showTrend: boolean;
}

export interface ResolvedAppearance {
  palette: Palette;
  gradient: Gradient;
  theme: ThemeName;
  textSize: TextSize;
  colours: ZoneColours;
  showZoneGlyph: boolean;
  showTrend: boolean;
}

export interface GaugeSettings extends Appearance {
  schema: number;
  sensorKey: string;
  /** Raw AIDA64 sensor ID typed by the user; wins over sensorKey when set. */
  sensorId: string;
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
  smoothing: number;
  holdMinMax: boolean;
  pressAction: PressAction;
  alertLevel: AlertLevel;
  alertFlash: boolean;
  alertSound: boolean;
}

export interface FormulaSettings extends GaugeSettings {
  expression: string;
  /** Sensor keys for variables a…h. */
  inputs: string[];
}

export interface MultiSlot {
  sensorKey: string;
  label: string;
}

export interface MultiSettings extends Appearance {
  schema: number;
  count: 2 | 3 | 4;
  slots: MultiSlot[];
  decimals: number;
  intervalMs: number;
  colorMode: ColorMode;
  background: Background;
  solid: string;
  pressAction: "refresh" | "open-aida64";
}

export type DialView = "bar" | "value" | "sparkline";

export interface DialSettings extends Appearance {
  schema: number;
  /** Up to 4 sensors to cycle through with the dial. */
  sensors: string[];
  index: number;
  view: DialView;
  rotateMode: "cycle" | "adjust";
  adjustStep: number;
  /** Per-sensor offsets applied to High/Critical in "adjust" mode. */
  offsets: Record<string, number>;
  decimals: number;
  intervalMs: number;
  smoothing: number;
  background: Background;
}

const STYLES = new Set<GaugeStyle>(["radial", "bar", "value", "sparkline"]);
const PALETTES = new Set(["default", "colourblind", "custom"]);
const GRADIENTS = new Set(["smooth", "stepped"]);
const TEXT_SIZES = new Set(["small", "medium", "large"]);

type Loose = Record<string, unknown>;
export const obj = (v: unknown): Loose => (v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : {});
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
export function num(v: unknown, fallback: number): number {
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
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : fallback);
const decimals = (v: unknown, fallback: number) => Math.max(0, Math.min(3, Math.round(num(v, fallback))));
function pick<T extends string>(v: unknown, allowed: Set<string>, fallback: T, allowInherit = false): T {
  const s = str(v);
  if (allowInherit && s === "inherit") return s as T;
  return allowed.has(s) ? (s as T) : fallback;
}

export function clampInterval(value: number): number {
  const v = Number.isFinite(value) ? value : 1000;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(v)));
}

export function formatNumber(value: number, places: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(Math.max(0, Math.min(3, Math.round(places))));
}

// ---- global ---------------------------------------------------------------

export function defaultGlobal(): GlobalSettings {
  return { palette: "default", gradient: "smooth", theme: "default", textSize: "medium", colCold: DEFAULT_ZONES.cold, colNormal: DEFAULT_ZONES.normal, colHigh: DEFAULT_ZONES.high, colCrit: DEFAULT_ZONES.crit, aidaPath: "" };
}

/** Global settings use a `g_` prefix so sdpi `global` fields don't clash with key fields. */
export function parseGlobal(raw: unknown): GlobalSettings {
  const n = obj(raw);
  const d = defaultGlobal();
  return {
    palette: pick(n.g_palette, PALETTES, d.palette),
    gradient: pick(n.g_gradient, GRADIENTS, d.gradient),
    theme: pick(n.g_theme, new Set(Object.keys(THEMES)), d.theme),
    textSize: pick(n.g_textSize, TEXT_SIZES, d.textSize),
    colCold: validHex(n.g_colCold) ?? d.colCold,
    colNormal: validHex(n.g_colNormal) ?? d.colNormal,
    colHigh: validHex(n.g_colHigh) ?? d.colHigh,
    colCrit: validHex(n.g_colCrit) ?? d.colCrit,
    aidaPath: str(n.g_aidaPath).trim(),
  };
}

// ---- appearance -------------------------------------------------------------

export function defaultAppearance(): Appearance {
  return { palette: "inherit", gradient: "inherit", theme: "inherit", textSize: "inherit", colCold: DEFAULT_ZONES.cold, colNormal: DEFAULT_ZONES.normal, colHigh: DEFAULT_ZONES.high, colCrit: DEFAULT_ZONES.crit, showZoneGlyph: true, showTrend: true };
}

export function parseAppearance(raw: unknown): Appearance {
  const n = obj(raw);
  const d = defaultAppearance();
  return {
    palette: pick(n.palette, PALETTES, d.palette, true),
    gradient: pick(n.gradient, GRADIENTS, d.gradient, true),
    theme: pick(n.theme, new Set(Object.keys(THEMES)), d.theme, true),
    textSize: pick(n.textSize, TEXT_SIZES, d.textSize, true),
    colCold: validHex(n.colCold) ?? d.colCold,
    colNormal: validHex(n.colNormal) ?? d.colNormal,
    colHigh: validHex(n.colHigh) ?? d.colHigh,
    colCrit: validHex(n.colCrit) ?? d.colCrit,
    showZoneGlyph: bool(n.showZoneGlyph, d.showZoneGlyph),
    showTrend: bool(n.showTrend, d.showTrend),
  };
}

/** Applies global defaults to "inherit" values. Custom colours come from wherever "custom" was chosen. */
export function resolveAppearance(a: Appearance, g: GlobalSettings): ResolvedAppearance {
  const palette = a.palette === "inherit" ? g.palette : a.palette;
  const customFrom = a.palette === "custom" ? a : g;
  return {
    palette,
    gradient: a.gradient === "inherit" ? g.gradient : a.gradient,
    theme: a.theme === "inherit" ? g.theme : a.theme,
    textSize: a.textSize === "inherit" ? g.textSize : a.textSize,
    colours: zoneColours(palette, { cold: customFrom.colCold, normal: customFrom.colNormal, high: customFrom.colHigh, crit: customFrom.colCrit }),
    showZoneGlyph: a.showZoneGlyph,
    showTrend: a.showTrend,
  };
}

// ---- gauge ----------------------------------------------------------------------

export function defaultGauge(sensorKey = ""): GaugeSettings {
  return {
    schema: SCHEMA,
    sensorKey,
    sensorId: "",
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
    solid: "#d7dbe3",
    intervalMs: 1000,
    showLabel: true,
    smoothing: 1,
    holdMinMax: false,
    pressAction: "refresh",
    alertLevel: "off",
    alertFlash: true,
    alertSound: false,
    ...defaultAppearance(),
  };
}

export function parseGauge(raw: unknown): GaugeSettings {
  const d = defaultGauge();
  const n = obj(raw);
  const style = str(n.style) as GaugeStyle;
  const mode = str(n.colorMode);
  return {
    schema: SCHEMA,
    sensorKey: str(n.sensorKey),
    sensorId: str(n.sensorId).trim(),
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
    solid: validHex(n.solid) ?? d.solid,
    intervalMs: clampInterval(num(n.intervalMs, d.intervalMs)),
    showLabel: bool(n.showLabel, true),
    smoothing: Math.max(1, Math.min(20, Math.round(num(n.smoothing, d.smoothing)))),
    holdMinMax: bool(n.holdMinMax, d.holdMinMax),
    pressAction: pick(n.pressAction, new Set(["refresh", "cycle", "reset", "open-aida64"]), d.pressAction),
    alertLevel: pick(n.alertLevel, new Set(["off", "high", "crit"]), d.alertLevel),
    alertFlash: bool(n.alertFlash, d.alertFlash),
    alertSound: bool(n.alertSound, d.alertSound),
    ...parseAppearance(n),
  };
}

/** The sensor a gauge should show: the raw ID override, else the dropdown key. */
export function gaugeTarget(s: { sensorKey: string; sensorId: string }): string {
  return s.sensorId || s.sensorKey;
}

/**
 * Applies per-sensor defaults (scale, unit, zones) when the user picks a new
 * sensor. Display preferences and colours are kept. The user can then override
 * any value in the inspector.
 */
export function applyRecommendation<T extends GaugeSettings>(sensor: Sensor, previous: T): T {
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

// ---- formula ------------------------------------------------------------------

export function defaultFormula(): FormulaSettings {
  return { ...defaultGauge(), expression: "max(a, b)", inputs: ["", "", "", "", "", "", "", ""], label: "Formula", warn: null, crit: null, colorMode: "solid", style: "value" };
}

export function parseFormula(raw: unknown): FormulaSettings {
  const n = obj(raw);
  const d = defaultFormula();
  const g = parseGauge({ ...d, ...n });
  return {
    ...g,
    expression: str(n.expression, d.expression).slice(0, 200),
    inputs: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => str(n[`in${i}`])),
  };
}

// ---- multi ----------------------------------------------------------------------

export function defaultMulti(): MultiSettings {
  return {
    schema: SCHEMA,
    count: 2,
    slots: [0, 1, 2, 3].map(() => ({ sensorKey: "", label: "" })),
    decimals: 0,
    intervalMs: 1000,
    colorMode: "threshold",
    background: "heat",
    solid: "#d7dbe3",
    pressAction: "refresh",
    ...defaultAppearance(),
  };
}

export function parseMulti(raw: unknown): MultiSettings {
  const d = defaultMulti();
  const n = obj(raw);
  const count = num(n.count, d.count);
  const mode = str(n.colorMode);
  return {
    schema: SCHEMA,
    count: count === 3 || count === 4 ? count : 2,
    slots: [0, 1, 2, 3].map((i) => ({ sensorKey: str(n[`slot${i}`]), label: str(n[`slotLabel${i}`]) })),
    decimals: decimals(n.decimals, d.decimals),
    intervalMs: clampInterval(num(n.intervalMs, d.intervalMs)),
    colorMode: mode === "solid" ? "solid" : "threshold",
    background: n.background === "steady" ? "steady" : "heat",
    solid: validHex(n.solid) ?? d.solid,
    pressAction: n.pressAction === "open-aida64" ? "open-aida64" : "refresh",
    ...parseAppearance(n),
  };
}

// ---- dial -----------------------------------------------------------------------

export function defaultDial(): DialSettings {
  return { schema: SCHEMA, sensors: ["", "", "", ""], index: 0, view: "bar", rotateMode: "cycle", adjustStep: 1, offsets: {}, decimals: 0, intervalMs: 1000, smoothing: 1, background: "heat", ...defaultAppearance() };
}

export function parseDial(raw: unknown): DialSettings {
  const d = defaultDial();
  const n = obj(raw);
  const offsets: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(n.offsets))) if (typeof v === "number" && Number.isFinite(v)) offsets[k] = v;
  return {
    schema: SCHEMA,
    sensors: [0, 1, 2, 3].map((i) => str(n[`dial${i}`])),
    index: Math.max(0, Math.min(3, Math.round(num(n.index, 0)))),
    view: pick(n.view, new Set(["bar", "value", "sparkline"]), d.view),
    rotateMode: n.rotateMode === "adjust" ? "adjust" : "cycle",
    adjustStep: Math.max(0.1, Math.min(50, num(n.adjustStep, d.adjustStep))),
    offsets,
    decimals: decimals(n.decimals, d.decimals),
    intervalMs: clampInterval(num(n.intervalMs, d.intervalMs)),
    smoothing: Math.max(1, Math.min(20, Math.round(num(n.smoothing, d.smoothing)))),
    background: n.background === "steady" ? "steady" : "heat",
    ...parseAppearance(n),
  };
}
