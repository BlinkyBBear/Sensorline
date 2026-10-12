import { describe, expect, it } from "vitest";
import { COLOURBLIND_ZONES, contrastRatio, DEFAULT_ZONES, ensureContrast, mixOklab } from "../src/colour.js";
import { render } from "../src/render.js";
import { defaultGauge, type ResolvedAppearance } from "../src/settings.js";
import { MIN_CONTRAST, readable, THEMES, tintedBackground } from "../src/theme.js";
import { gaugeView } from "../src/view.js";

const zoneSets = [DEFAULT_ZONES, COLOURBLIND_ZONES, { cold: "#ffffff", normal: "#ffff00", high: "#00ffff", crit: "#ff00ff" }];

/** Every colour the smooth gradient can produce, sampled. */
function gradientColours(z: typeof DEFAULT_ZONES): string[] {
  const stops = [z.cold, z.normal, z.high, z.crit];
  const out: string[] = [];
  for (let i = 0; i < 3; i += 1) for (let t = 0; t <= 1; t += 0.1) out.push(mixOklab(stops[i]!, stops[i + 1]!, t));
  return out;
}

describe("contrast maths", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
  it("ensureContrast reaches the target", () => {
    for (const [fg, bg] of [["#2ecc71", "#2a2a00"], ["#0072b2", "#000000"], ["#f5c400", "#ffffff"], ["#101114", "#101114"]] as const) {
      expect(contrastRatio(ensureContrast(fg, bg), bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});

describe("themes keep value text at ≥ 4.5:1", () => {
  for (const theme of Object.values(THEMES)) {
    it(`${theme.name}: plain background`, () => {
      const c = readable(theme, theme.bg);
      expect(contrastRatio(c.fg, theme.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrastRatio(c.muted, theme.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      // The theme's own colours already pass without adjustment.
      expect(contrastRatio(theme.fg, theme.bg)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(theme.muted, theme.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
    it(`${theme.name}: every tinted zone background`, () => {
      for (const zones of zoneSets) {
        for (const colour of gradientColours(zones)) {
          const bg = tintedBackground(theme, colour);
          const c = readable(theme, bg);
          expect(contrastRatio(c.fg, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
          expect(contrastRatio(c.muted, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
          // Coloured value text (Value style) is adjusted to pass as well.
          expect(contrastRatio(ensureContrast(colour, bg), bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
        }
      }
    });
  }

  it("flashing (bright critical background) still gets readable text", () => {
    for (const zones of zoneSets) {
      const c = readable(THEMES.default, zones.crit);
      expect(contrastRatio(c.fg, zones.crit)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});

describe("rendered keys", () => {
  const app: ResolvedAppearance = { palette: "default", gradient: "smooth", theme: "default", textSize: "medium", colours: DEFAULT_ZONES, showZoneGlyph: true, showTrend: true };
  const sensor = { key: "TCPU", id: "TCPU", label: "CPU", raw: "88", type: "temp" as const, numeric: 88, unit: "°C" };
  const snap = { phase: "live" as const, source: "shared-memory", detail: "", sensors: [sensor] };
  const st = { ...defaultGauge("TCPU"), min: 20, max: 100, cold: 30, warn: 70, crit: 85 };
  const rt = { value: 88, history: [], min: null, max: null, trend: "up" as const, flash: false };

  it("draws a non-colour zone symbol and a trend arrow", () => {
    const svg = render(gaugeView(st, app, snap, rt, sensor, "TCPU"));
    expect(svg).toContain('data-glyph="crit"');
    expect(svg).toContain('data-trend="up"');
  });

  it("uses distinct symbols per zone", () => {
    const glyph = (v: number) => /data-glyph="(\w+)"/.exec(render(gaugeView(st, app, snap, { ...rt, value: v }, sensor, "TCPU")))?.[1];
    expect([glyph(25), glyph(50), glyph(75), glyph(90)]).toEqual(["cold", "normal", "high", "crit"]);
  });

  it("text is never smaller than 15 px at 144 px (7.5 px at 72 px)", () => {
    for (const style of ["radial", "bar", "value", "sparkline"] as const) {
      const svg = render(gaugeView({ ...st, style, holdMinMax: true }, { ...app, textSize: "small" }, snap, { ...rt, min: 30, max: 90 }, sensor, "TCPU"));
      const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(15 * 0.88 * 0.9 - 0.01);
    }
  });

  it("shows on-key setup steps when AIDA64 is not sharing", () => {
    const svg = render(gaugeView(st, app, { ...snap, phase: "sharing-off", sensors: [] }, rt, undefined, "TCPU"));
    expect(svg).toContain("External Apps");
  });
});
