import { backgroundShade, contrastRatio, ensureContrast } from "./colour.js";

export type ThemeName = "default" | "dark" | "high-contrast";
export type TextSize = "small" | "medium" | "large";

export interface Theme {
  name: ThemeName;
  bg: string;
  fg: string;
  muted: string;
  track: string;
  off: string;
  neutral: string;
  /** Stroke width multiplier for arcs and bars. */
  stroke: number;
  /** How the zone colour tints the background (0 = not at all). */
  tint: number;
}

export const THEMES: Record<ThemeName, Theme> = {
  default: { name: "default", bg: "#101114", fg: "#f4f6f8", muted: "#b4bcc8", track: "#2c313a", off: "#9aa2ae", neutral: "#d7dbe3", stroke: 1, tint: 1 },
  dark: { name: "dark", bg: "#000000", fg: "#e8eaed", muted: "#a9b0ba", track: "#1c1f24", off: "#8f97a3", neutral: "#c9ced6", stroke: 1, tint: 0.6 },
  "high-contrast": { name: "high-contrast", bg: "#000000", fg: "#ffffff", muted: "#ffffff", track: "#5a5a5a", off: "#ffffff", neutral: "#ffffff", stroke: 1.35, tint: 0 },
};

export const TEXT_SCALE: Record<TextSize, number> = { small: 0.88, medium: 1, large: 1.14 };

/** Minimum contrast for value text (WCAG AA for normal text). */
export const MIN_CONTRAST = 4.5;

export function theme(name: string | undefined): Theme {
  return THEMES[(name as ThemeName) in THEMES ? (name as ThemeName) : "default"];
}

/** Background for a zone colour under a theme (tinted shade, or the plain theme background). */
export function tintedBackground(t: Theme, zoneColour: string | null): string {
  if (!zoneColour || t.tint <= 0) return t.bg;
  if (t.tint >= 1) return backgroundShade(zoneColour);
  // Partial tint: darker shade for the dark theme.
  const shade = backgroundShade(zoneColour);
  const r = (i: number) => parseInt(shade.slice(i, i + 2), 16);
  const k = t.tint;
  const mix = (i: number) => Math.round(r(i) * k).toString(16).padStart(2, "0");
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/** Text colours guaranteed to reach MIN_CONTRAST on `bg`. */
export function readable(t: Theme, bg: string): { fg: string; muted: string } {
  return { fg: ensureContrast(t.fg, bg, MIN_CONTRAST), muted: ensureContrast(t.muted, bg, MIN_CONTRAST) };
}

export { contrastRatio };
