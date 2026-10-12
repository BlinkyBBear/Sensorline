/** Colour maths and zone mapping. Pure functions; unit-tested. */

export type Palette = "default" | "colourblind" | "custom";
export type Gradient = "smooth" | "stepped";

export interface ZoneColours {
  cold: string;
  normal: string;
  high: string;
  crit: string;
}

export const DEFAULT_ZONES: ZoneColours = { cold: "#2f7bff", normal: "#2ecc71", high: "#f5c400", crit: "#ff3b30" };
/** Okabe-Ito: blue → sky blue → orange → vermillion. Safe for deuteranopia/protanopia. */
export const COLOURBLIND_ZONES: ZoneColours = { cold: "#0072b2", normal: "#56b4e9", high: "#e69f00", crit: "#d55e00" };

export function zoneColours(palette: Palette, custom: Partial<ZoneColours>): ZoneColours {
  if (palette === "colourblind") return COLOURBLIND_ZONES;
  if (palette === "custom") {
    return {
      cold: validHex(custom.cold) ?? DEFAULT_ZONES.cold,
      normal: validHex(custom.normal) ?? DEFAULT_ZONES.normal,
      high: validHex(custom.high) ?? DEFAULT_ZONES.high,
      crit: validHex(custom.crit) ?? DEFAULT_ZONES.crit,
    };
  }
  return DEFAULT_ZONES;
}

export function validHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}

type RGB = [number, number, number];
type Lab = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const v = validHex(hex) ?? "#000000";
  return [parseInt(v.slice(1, 3), 16) / 255, parseInt(v.slice(3, 5), 16) / 255, parseInt(v.slice(5, 7), 16) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB → OKLab (Björn Ottosson, 2020). */
export function rgbToOklab([r, g, b]: RGB): Lab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Interpolates two hex colours in OKLab; t is clamped to 0..1. */
export function mixOklab(from: string, to: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const a = rgbToOklab(hexToRgb(from));
  const b = rgbToOklab(hexToRgb(to));
  return rgbToHex(oklabToRgb([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]));
}

/** Darkened variant of a colour for the key background (lower lightness and chroma in OKLab). */
export function backgroundShade(hex: string): string {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  return rgbToHex(oklabToRgb([0.17 + L * 0.16, a * 0.55, b * 0.55]));
}

export interface Zones {
  min: number;
  max: number;
  cold: number | null;
  warn: number | null;
  crit: number | null;
}

interface Anchor {
  value: number;
  colour: keyof ZoneColours;
}

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Builds colour anchors along the value axis:
 *   cold → Cold, midpoint(cold, warn) → Normal, warn → High, crit → Critical.
 * Missing values are filled in sensibly. Works for inverted scales (crit < warn).
 * Returns null for neutral sensors (no warn and no crit).
 */
export function anchors(z: Zones): Anchor[] | null {
  if (!ok(z.warn) && !ok(z.crit)) return null;
  let warn = z.warn;
  let crit = z.crit;
  const lo = Math.min(z.min, z.max);
  const hi = Math.max(z.min, z.max);
  if (!ok(crit)) crit = Math.max(warn!, hi);
  const ascending = !ok(warn) ? true : crit >= warn;
  const coldDefault = ascending ? lo : hi;
  const cold = ok(z.cold) ? z.cold : coldDefault;
  if (!ok(warn)) warn = cold + (crit - cold) * (2 / 3);
  const normal = cold + (warn - cold) / 2;
  return [
    { value: cold, colour: "cold" },
    { value: normal, colour: "normal" },
    { value: warn, colour: "high" },
    { value: crit, colour: "crit" },
  ];
}

/** Colour for a value. Smooth interpolates in OKLab; Stepped returns the zone colour. */
export function colourFor(value: number | null, z: Zones, colours: ZoneColours, gradient: Gradient): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const list = anchors(z);
  if (!list) return null;
  const ascending = list[3]!.value >= list[2]!.value;
  // Express positions so that "further along" always means "hotter".
  const pos = (v: number) => (ascending ? v : -v);
  const p = pos(value);
  const pts = list.map((a) => ({ p: pos(a.value), colour: colours[a.colour] }));
  if (gradient === "stepped") {
    if (p >= pts[3]!.p) return colours.crit;
    if (p >= pts[2]!.p) return colours.high;
    if (ok(z.cold) && p < pts[0]!.p) return colours.cold;
    return colours.normal;
  }
  if (p <= pts[0]!.p) return pts[0]!.colour;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (p <= b.p) {
      const span = b.p - a.p;
      return span <= 0 ? b.colour : mixOklab(a.colour, b.colour, (p - a.p) / span);
    }
  }
  return pts[pts.length - 1]!.colour;
}

/** 0..1 "heat" used to pick the hottest slot on a Multi key. */
export function heat(value: number | null, z: Zones): number {
  if (value === null || !Number.isFinite(value)) return -1;
  const list = anchors(z);
  if (!list) return -1;
  const ascending = list[3]!.value >= list[2]!.value;
  const p = ascending ? value : -value;
  const start = ascending ? list[0]!.value : -list[0]!.value;
  const end = ascending ? list[3]!.value : -list[3]!.value;
  if (end === start) return p >= end ? 1 : 0;
  return Math.min(1, Math.max(0, (p - start) / (end - start)));
}

export type Zone = "cold" | "normal" | "high" | "crit";

/** Which zone a value falls in (the same boundaries as Stepped). Null for neutral sensors. */
export function zoneOf(value: number | null, z: Zones): Zone | null {
  if (value === null || !Number.isFinite(value)) return null;
  const list = anchors(z);
  if (!list) return null;
  const ascending = list[3]!.value >= list[2]!.value;
  const p = ascending ? value : -value;
  const at = (i: number) => (ascending ? list[i]!.value : -list[i]!.value);
  if (p >= at(3)) return "crit";
  if (p >= at(2)) return "high";
  if (ok(z.cold) && p < at(0)) return "cold";
  return "normal";
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Returns `fg`, lightened (or darkened) in OKLab until it reaches `min`
 * contrast against `bg`. Hue is kept as far as possible.
 */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  if (contrastRatio(fg, bg) >= min) return fg;
  const lighter = luminance(bg) < 0.18;
  const [L, a, b] = rgbToOklab(hexToRgb(fg));
  for (let step = 1; step <= 40; step += 1) {
    const k = step / 40;
    const nextL = lighter ? L + (1 - L) * k : L * (1 - k);
    const candidate = rgbToHex(oklabToRgb([nextL, a * (1 - k), b * (1 - k)]));
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  return lighter ? "#ffffff" : "#000000";
}
