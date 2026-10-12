import { ensureContrast, type Zone } from "./colour.js";
import type { Trend } from "./stats.js";
import { MIN_CONTRAST, readable } from "./theme.js";
import type { KeyView, SlotView } from "./view.js";

const FONT = "Segoe UI, IBM Plex Sans, Helvetica, Arial, sans-serif";
const ARC_START = 138;
const ARC_SWEEP = 264;
/** Smallest text size at 144 px; Stream Deck shows keys at 72 px, so this is 7.5 px there. */
const MIN_TEXT = 15;

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const sweep = Math.max(0.01, Math.min(359.9, to - from));
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, from + sweep);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function text(t: string, x: number, y: number, size: number, fill: string, weight = 600, anchor = "middle"): string {
  return `<text x="${x}" y="${y.toFixed(1)}" fill="${fill}" font-family="${FONT}" font-size="${size.toFixed(1)}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="middle" style="font-variant-numeric:tabular-nums">${escape(t)}</text>`;
}

function svg(body: string, background: string, w = 144, h = 144): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${background}"/>${body}</svg>`;
}

function split(value: string, unit: string): { main: string; sub: string } {
  if (!unit) return { main: value, sub: "" };
  const joined = unit.startsWith("°") ? `${value}${unit}` : `${value} ${unit}`;
  return joined.length <= 6 ? { main: joined, sub: "" } : { main: value, sub: unit };
}

function fit(t: string, size: number): number {
  if (t.length <= 3) return size;
  if (t.length <= 5) return size - 6;
  if (t.length <= 7) return size - 10;
  return Math.max(18, size - 14);
}

/**
 * Non-colour zone cue, drawn as a vector shape so it does not depend on fonts:
 * cold ▽ (down triangle), normal ● (dot), high △ (up triangle), critical ⚠ (triangle with "!").
 */
export function zoneGlyph(zone: Zone | null, cx: number, cy: number, size: number, fill: string, bg: string): string {
  if (!zone) return "";
  const h = size / 2;
  const sw = Math.max(2, size / 7).toFixed(1);
  switch (zone) {
    case "cold":
      return `<path data-glyph="cold" d="M ${cx - h} ${cy - h * 0.7} L ${cx + h} ${cy - h * 0.7} L ${cx} ${cy + h * 0.8} Z" fill="none" stroke="${fill}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    case "normal":
      return `<circle data-glyph="normal" cx="${cx}" cy="${cy}" r="${(h * 0.6).toFixed(1)}" fill="${fill}"/>`;
    case "high":
      return `<path data-glyph="high" d="M ${cx - h} ${cy + h * 0.7} L ${cx + h} ${cy + h * 0.7} L ${cx} ${cy - h * 0.8} Z" fill="none" stroke="${fill}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    case "crit":
      return `<g data-glyph="crit"><path d="M ${cx - h} ${cy + h * 0.8} L ${cx + h} ${cy + h * 0.8} L ${cx} ${cy - h * 0.9} Z" fill="${fill}"/><rect x="${(cx - size * 0.06).toFixed(1)}" y="${(cy - h * 0.3).toFixed(1)}" width="${(size * 0.12).toFixed(1)}" height="${(h * 0.6).toFixed(1)}" fill="${bg}"/><rect x="${(cx - size * 0.06).toFixed(1)}" y="${(cy + h * 0.42).toFixed(1)}" width="${(size * 0.12).toFixed(1)}" height="${(size * 0.12).toFixed(1)}" fill="${bg}"/></g>`;
  }
}

/** Trend arrow (up, down, or a flat dash). */
export function trendArrow(trend: Trend | null, cx: number, cy: number, size: number, stroke: string): string {
  if (!trend) return "";
  const h = size / 2;
  const sw = Math.max(2, size / 7).toFixed(1);
  if (trend === "flat") return `<path data-trend="flat" d="M ${cx - h} ${cy} L ${cx + h} ${cy}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  const dir = trend === "up" ? -1 : 1;
  return `<path data-trend="${trend}" d="M ${cx} ${cy - dir * h} L ${cx} ${cy + dir * h} M ${cx - h * 0.7} ${cy + dir * h * 0.2} L ${cx} ${cy + dir * h} L ${cx + h * 0.7} ${cy + dir * h * 0.2}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function cues(v: KeyView, y: number, fg: string): string {
  const glyphColour = ensureContrast(v.color, v.background, 3);
  return `${v.showZoneGlyph ? zoneGlyph(v.zone, 17, y, 18, glyphColour, v.background) : ""}${trendArrow(v.trend, 127, y, 18, fg)}`;
}

function statusKey(v: KeyView): string {
  const c = readable(v.theme, v.background);
  const s = v.scale;
  const steps = v.steps ?? [];
  if (steps.length) {
    const lines = steps.slice(0, 3).map((line, i) => text(line, 72, 70 + i * 22 * s, MIN_TEXT * s, c.fg, 500)).join("");
    return svg(`${text(v.title, 72, 34, 20 * s, c.fg, 700)}<rect x="24" y="50" width="96" height="2" fill="${v.theme.track}"/>${lines}`, v.background);
  }
  return svg(
    `<path d="${arc(72, 68, 46, ARC_START, ARC_START + ARC_SWEEP)}" fill="none" stroke="${v.theme.track}" stroke-width="8" stroke-linecap="round" stroke-dasharray="2 8"/>
     ${text(v.title || "No signal", 72, 64, 18 * s, c.fg, 600)}
     ${text(v.message || "", 72, 90, MIN_TEXT * s, c.muted, 500)}`,
    v.background,
  );
}

function radial(v: KeyView): string {
  const c = readable(v.theme, v.background);
  const s = v.scale;
  const sw = 8 * v.theme.stroke;
  const f = v.fraction ?? 0;
  const fill = v.fraction === null || f <= 0 ? "" : `<path d="${arc(72, 66, 46, ARC_START, ARC_START + ARC_SWEEP * f)}" fill="none" stroke="${v.color}" stroke-width="${sw}" stroke-linecap="round"/>`;
  const t = split(v.valueText, v.unit);
  const sub = v.minmax ?? t.sub;
  return svg(
    `<path d="${arc(72, 66, 46, ARC_START, ARC_START + ARC_SWEEP)}" fill="none" stroke="${v.theme.track}" stroke-width="${sw}" stroke-linecap="round"/>
     ${fill}
     ${text(t.main, 72, sub ? 62 : 68, fit(t.main, 30) * s, c.fg, 700)}
     ${sub ? text(sub, 72, 86, MIN_TEXT * s * (v.minmax ? 0.9 : 1), c.muted, 500) : ""}
     ${v.title ? text(v.title, 72, 128, MIN_TEXT * s, c.muted, 500) : ""}
     ${cues(v, 17, c.fg)}`,
    v.background,
  );
}

function bar(v: KeyView): string {
  const c = readable(v.theme, v.background);
  const s = v.scale;
  const t = split(v.valueText, v.unit);
  const w = 112 * (v.fraction ?? 0);
  const bh = 10 * v.theme.stroke;
  return svg(
    `${v.title ? text(v.title, 72, 40, MIN_TEXT * s, c.muted, 500) : ""}
     ${text(t.main, 72, 72, fit(t.main, 34) * s, c.fg, 700)}
     ${v.minmax || t.sub ? text(v.minmax ?? t.sub, 72, 96, MIN_TEXT * s * 0.9, c.muted, 500) : ""}
     <rect x="16" y="110" width="112" height="${bh}" rx="${bh / 2}" fill="${v.theme.track}"/>
     <rect x="16" y="110" width="${w.toFixed(2)}" height="${bh}" rx="${bh / 2}" fill="${v.color}"/>
     ${cues(v, 17, c.fg)}`,
    v.background,
  );
}

function value(v: KeyView): string {
  const c = readable(v.theme, v.background);
  const s = v.scale;
  const t = split(v.valueText, v.unit);
  const colour = v.color === v.theme.neutral ? c.fg : ensureContrast(v.color, v.background, MIN_CONTRAST);
  return svg(
    `${v.title ? text(v.title, 72, 40, MIN_TEXT * s, c.muted, 500) : ""}
     ${text(t.main, 72, t.sub || v.minmax ? 76 : 82, fit(t.main, 36) * s, colour, 700)}
     ${v.minmax || t.sub ? text(v.minmax ?? t.sub, 72, 108, MIN_TEXT * s, c.muted, 500) : ""}
     ${cues(v, 17, c.fg)}`,
    v.background,
  );
}

function sparkline(v: KeyView): string {
  const c = readable(v.theme, v.background);
  const s = v.scale;
  const pts = v.history.length > 1 ? v.history : [v.fraction ?? 0, v.fraction ?? 0];
  const points = pts
    .map((p, i) => `${(14 + (i / Math.max(1, pts.length - 1)) * 116).toFixed(1)},${(112 - Math.min(1, Math.max(0, p)) * 52).toFixed(1)}`)
    .join(" ");
  const t = split(v.valueText, v.unit);
  return svg(
    `${text(t.main, 72, 30, fit(t.main, 28) * s, c.fg, 700)}
     ${v.title ? text(v.title, 72, 128, MIN_TEXT * s, c.muted, 500) : ""}
     <polyline points="${points}" fill="none" stroke="${v.color}" stroke-width="${(3 * v.theme.stroke).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>
     ${cues(v, 128, c.fg)}`,
    v.background,
  );
}

function rows(v: KeyView, slots: SlotView[]): string {
  const c = readable(v.theme, v.background);
  const h = 144 / Math.max(1, slots.length);
  const size = slots.length >= 3 ? MIN_TEXT : 17;
  return slots
    .map((sl, i) => {
      const y = i * h;
      const t = split(sl.valueText, sl.unit);
      const w = 120 * (sl.fraction ?? 0);
      const glyph = v.showZoneGlyph ? zoneGlyph(sl.zone, 132, y + h - 11, 10, ensureContrast(sl.color, v.background, 3), v.background) : "";
      return `${text(sl.title, 12, y + 16, size * v.scale, c.muted, 500, "start")}
        ${text(t.main, 132, y + 16, (size + 2) * v.scale, c.fg, 700, "end")}
        <rect x="12" y="${(y + h - 14).toFixed(1)}" width="108" height="6" rx="3" fill="${v.theme.track}"/>
        <rect x="12" y="${(y + h - 14).toFixed(1)}" width="${(w * 0.9).toFixed(1)}" height="6" rx="3" fill="${sl.color}"/>${glyph}`;
    })
    .join("");
}

function quad(v: KeyView, slots: SlotView[]): string {
  const c = readable(v.theme, v.background);
  return slots
    .map((sl, i) => {
      const cx = i % 2 === 0 ? 36 : 108;
      const cy = i < 2 ? 36 : 108;
      const f = sl.fraction ?? 0;
      const fill = sl.fraction && sl.fraction > 0 ? `<path d="${arc(cx, cy - 6, 24, ARC_START, ARC_START + ARC_SWEEP * f)}" fill="none" stroke="${sl.color}" stroke-width="5" stroke-linecap="round"/>` : "";
      const t = split(sl.valueText, sl.unit);
      return `<path d="${arc(cx, cy - 6, 24, ARC_START, ARC_START + ARC_SWEEP)}" fill="none" stroke="${v.theme.track}" stroke-width="5" stroke-linecap="round"/>
        ${fill}
        ${text(t.main, cx, cy - 5, (t.main.length > 4 ? 13 : 15) * v.scale, c.fg, 700)}
        ${text(sl.title, cx, cy + 25, 12 * v.scale, c.muted, 500)}`;
    })
    .join("");
}

/** Renders a 144 × 144 key image (Stream Deck scales it to 72 px on standard keys). */
export function render(v: KeyView): string {
  switch (v.style) {
    case "status":
      return statusKey(v);
    case "multi": {
      const slots = v.slots ?? [];
      return svg(slots.length >= 4 ? quad(v, slots.slice(0, 4)) : rows(v, slots), v.background);
    }
    case "bar":
      return bar(v);
    case "sparkline":
      return sparkline(v);
    case "value":
      return value(v);
    default:
      return radial(v);
  }
}

export type StripView = "bar" | "arc" | "sparkline" | "split" | "value";

/** One half of the split touch-strip view. */
export interface StripSide {
  title: string;
  valueText: string;
  unit: string;
  fraction: number | null;
  color: string;
  zone: Zone | null;
}

function joined(v: { valueText: string; unit: string }): string {
  const t = split(v.valueText, v.unit);
  return t.sub ? `${t.main} ${t.sub}` : t.main;
}

function half(side: StripSide, x0: number, v: KeyView, trend: Trend | null): string {
  const c = readable(v.theme, v.background);
  const s = v.scale;
  const label = joined(side);
  const w = 84 * (side.fraction ?? 0);
  const glyph = v.showZoneGlyph ? zoneGlyph(side.zone, x0 + 86, 52, 13, ensureContrast(side.color, v.background, 3), v.background) : "";
  const arrow = trendArrow(trend, x0 + 86, 72, 11, c.fg);
  return `${text(side.title, x0 + 8, 16, 13 * s, c.muted, 500, "start")}
    ${text(label, x0 + 8, 50, (label.length > 6 ? 18 : 22) * s, c.fg, 700, "start")}${glyph}${arrow}
    <rect x="${x0 + 8}" y="82" width="84" height="8" rx="4" fill="${v.theme.track}"/><rect x="${x0 + 8}" y="82" width="${w.toFixed(1)}" height="8" rx="4" fill="${side.color}"/>`;
}

/**
 * Renders the 200 × 100 Stream Deck + touch-strip canvas for a dial. Every
 * element stays inside 0..200 × 0..100 (the custom layout is one full pixmap).
 */
export function renderStrip(v: KeyView, view: StripView, page: string, second?: StripSide): string {
  const c = readable(v.theme, v.background);
  const s = v.scale;
  if (v.style === "status") {
    const lines = (v.steps ?? [v.message ?? ""]).slice(0, 3).map((l, i) => text(l, 100, 48 + i * 18, 14 * s, c.fg, 500)).join("");
    return svg(`${text(v.title, 100, 20, 18 * s, c.fg, 700)}${lines}`, v.background, 200, 100);
  }
  if (view === "split") {
    const left: StripSide = { title: v.title, valueText: v.valueText, unit: v.unit, fraction: v.fraction, color: v.color, zone: v.zone };
    const right: StripSide = second ?? { title: "Second sensor", valueText: "—", unit: "", fraction: null, color: v.theme.off, zone: null };
    return svg(`${half(left, 0, v, v.trend)}<rect x="99" y="8" width="2" height="84" fill="${v.theme.track}"/>${half(right, 100, v, null)}`, v.background, 200, 100);
  }
  const t = joined(v);
  const head = `${text(v.title, 12, 16, 14 * s, c.muted, 500, "start")}${page ? text(page, 188, 16, 13 * s, c.muted, 500, "end") : ""}`;
  const glyph = (x: number, y: number) => (v.showZoneGlyph ? zoneGlyph(v.zone, x, y, 18, ensureContrast(v.color, v.background, 3), v.background) : "");
  const trend = (x: number, y: number) => trendArrow(v.trend, x, y, 16, c.fg);
  const minmax = (y: number) => (v.minmax ? text(v.minmax, 12, y, 13 * s, c.muted, 500, "start") : "");
  let body: string;
  if (view === "arc") {
    const f = v.fraction ?? 0;
    const track = arc(148, 84, 40, -90, 90);
    const fill = v.fraction && v.fraction > 0 ? `<path d="${arc(148, 84, 40, -90, -90 + 180 * f)}" fill="none" stroke="${v.color}" stroke-width="${(9 * v.theme.stroke).toFixed(1)}" stroke-linecap="round"/>` : "";
    body = `<path d="${track}" fill="none" stroke="${v.theme.track}" stroke-width="${(9 * v.theme.stroke).toFixed(1)}" stroke-linecap="round"/>${fill}
      ${text(t, 12, 48, (t.length > 6 ? 22 : 28) * s, c.fg, 700, "start")}${minmax(84)}${glyph(148, 72)}${trend(92, 84)}`;
  } else if (view === "sparkline") {
    const pts = v.history.length > 1 ? v.history : [v.fraction ?? 0, v.fraction ?? 0];
    const points = pts.map((p, i) => `${(12 + (i / Math.max(1, pts.length - 1)) * 176).toFixed(1)},${(92 - Math.min(1, Math.max(0, p)) * 26).toFixed(1)}`).join(" ");
    body = `${text(t, 12, 46, 26 * s, c.fg, 700, "start")}<polyline points="${points}" fill="none" stroke="${v.color}" stroke-width="${(3 * v.theme.stroke).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>${glyph(178, 46)}${trend(154, 46)}`;
  } else if (view === "value") {
    body = `${text(t, 12, 56, 36 * s, ensureContrast(v.color === v.theme.neutral ? c.fg : v.color, v.background, MIN_CONTRAST), 700, "start")}${minmax(88)}${glyph(178, 52)}${trend(154, 52)}`;
  } else {
    const w = 176 * (v.fraction ?? 0);
    body = `${text(t, 12, 44, 28 * s, c.fg, 700, "start")}${minmax(67)}
      <rect x="12" y="80" width="176" height="12" rx="6" fill="${v.theme.track}"/><rect x="12" y="80" width="${w.toFixed(1)}" height="12" rx="6" fill="${v.color}"/>${glyph(178, 44)}${trend(154, 44)}`;
  }
  return svg(`${head}${body}`, v.background, 200, 100);
}
