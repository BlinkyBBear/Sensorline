import { THEME } from "./settings.js";
import type { KeyView, SlotView } from "./view.js";

const FONT = "IBM Plex Sans, Segoe UI, Helvetica, Arial, sans-serif";
const ARC_START = 138;
const ARC_SWEEP = 264;

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
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="middle" style="font-variant-numeric:tabular-nums">${escape(t)}</text>`;
}

function svg(body: string, background: string = THEME.bg): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="100%" height="100%"><rect width="144" height="144" fill="${background}"/>${body}</svg>`;
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
  return Math.max(16, size - 14);
}

function statusKey(v: KeyView): string {
  return svg(
    `<path d="${arc(72, 68, 46, ARC_START, ARC_START + ARC_SWEEP)}" fill="none" stroke="${THEME.track}" stroke-width="8" stroke-linecap="round" stroke-dasharray="2 8"/>
     ${text(v.title || "No signal", 72, 64, 15, THEME.fg, 600)}
     ${text(v.message || "", 72, 88, 11, THEME.muted, 500)}`,
    v.background,
  );
}

function radial(v: KeyView): string {
  const f = v.fraction ?? 0;
  const fill = v.fraction === null || f <= 0 ? "" : `<path d="${arc(72, 66, 46, ARC_START, ARC_START + ARC_SWEEP * f)}" fill="none" stroke="${v.color}" stroke-width="8" stroke-linecap="round"/>`;
  const t = split(v.valueText, v.unit);
  return svg(
    `<path d="${arc(72, 66, 46, ARC_START, ARC_START + ARC_SWEEP)}" fill="none" stroke="${THEME.track}" stroke-width="8" stroke-linecap="round"/>
     ${fill}
     ${text(t.main, 72, t.sub ? 62 : 68, fit(t.main, 28), THEME.fg, 600)}
     ${t.sub ? text(t.sub, 72, 84, 11, THEME.muted, 500) : ""}
     ${v.title ? text(v.title, 72, 128, 12, THEME.muted, 500) : ""}`,
    v.background,
  );
}

function bar(v: KeyView): string {
  const t = split(v.valueText, v.unit);
  const w = 112 * (v.fraction ?? 0);
  return svg(
    `${v.title ? text(v.title, 72, 36, 12, THEME.muted, 500) : ""}
     ${text(t.main, 72, 70, fit(t.main, 32), THEME.fg, 600)}
     ${t.sub ? text(t.sub, 72, 92, 11, THEME.muted, 500) : ""}
     <rect x="16" y="108" width="112" height="8" rx="4" fill="${THEME.track}"/>
     <rect x="16" y="108" width="${w.toFixed(2)}" height="8" rx="4" fill="${v.color}"/>`,
    v.background,
  );
}

function value(v: KeyView): string {
  const t = split(v.valueText, v.unit);
  return svg(
    `${v.title ? text(v.title, 72, 42, 12, THEME.muted, 500) : ""}
     ${text(t.main, 72, t.sub ? 74 : 80, fit(t.main, 34), v.color === THEME.neutral ? THEME.fg : v.color, 600)}
     ${t.sub ? text(t.sub, 72, 104, 13, THEME.muted, 500) : ""}`,
    v.background,
  );
}

function sparkline(v: KeyView): string {
  const pts = v.history.length > 1 ? v.history : [v.fraction ?? 0, v.fraction ?? 0];
  const points = pts
    .map((p, i) => `${(14 + (i / Math.max(1, pts.length - 1)) * 116).toFixed(1)},${(112 - Math.min(1, Math.max(0, p)) * 48).toFixed(1)}`)
    .join(" ");
  const t = split(v.valueText, v.unit);
  return svg(
    `<svg x="12" y="16" width="74" height="22" overflow="hidden"><text x="0" y="14" fill="${THEME.muted}" font-family="${FONT}" font-size="12" font-weight="500">${escape(v.title || "History")}</text></svg>
     ${text(t.main, 130, 28, 16, THEME.fg, 600, "end")}
     <polyline points="${points}" fill="none" stroke="${v.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`,
    v.background,
  );
}

function rows(slots: SlotView[]): string {
  const h = 144 / Math.max(1, slots.length);
  return slots
    .map((s, i) => {
      const y = i * h;
      const t = split(s.valueText, s.unit);
      const w = 120 * (s.fraction ?? 0);
      return `<text x="12" y="${(y + 16).toFixed(1)}" fill="${THEME.muted}" font-family="${FONT}" font-size="11" font-weight="500" text-anchor="start" dominant-baseline="middle">${escape(s.title)}</text>
        ${text(t.main, 132, y + 16, 15, THEME.fg, 600, "end")}
        <rect x="12" y="${(y + h - 14).toFixed(1)}" width="120" height="5" rx="2.5" fill="${THEME.track}"/>
        <rect x="12" y="${(y + h - 14).toFixed(1)}" width="${w.toFixed(1)}" height="5" rx="2.5" fill="${s.color}"/>`;
    })
    .join("");
}

function quad(slots: SlotView[]): string {
  return slots
    .map((s, i) => {
      const cx = i % 2 === 0 ? 36 : 108;
      const cy = i < 2 ? 36 : 108;
      const f = s.fraction ?? 0;
      const fill = s.fraction && s.fraction > 0 ? `<path d="${arc(cx, cy - 4, 24, ARC_START, ARC_START + ARC_SWEEP * f)}" fill="none" stroke="${s.color}" stroke-width="4" stroke-linecap="round"/>` : "";
      const t = split(s.valueText, s.unit);
      return `<path d="${arc(cx, cy - 4, 24, ARC_START, ARC_START + ARC_SWEEP)}" fill="none" stroke="${THEME.track}" stroke-width="4" stroke-linecap="round"/>
        ${fill}
        ${text(t.main, cx, cy - 2, t.main.length > 4 ? 10 : 12, THEME.fg, 600)}
        ${text(s.title, cx, cy + 22, 9, THEME.muted, 500)}`;
    })
    .join("");
}

export function render(v: KeyView): string {
  switch (v.style) {
    case "status":
      return statusKey(v);
    case "multi": {
      const slots = v.slots ?? [];
      return svg(slots.length >= 4 ? quad(slots.slice(0, 4)) : rows(slots), v.background);
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
