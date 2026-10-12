import { describe, expect, it } from "vitest";
import { anchors, backgroundShade, COLOURBLIND_ZONES, colourFor, DEFAULT_ZONES, heat, hexToRgb, mixOklab, oklabToRgb, rgbToHex, rgbToOklab, zoneColours } from "../src/colour.js";

const Z = { min: 20, max: 100, cold: 30, warn: 70, crit: 85 };
const dist = (a: string, b: string) => {
  const x = hexToRgb(a), y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 255;
};

describe("OKLab conversion", () => {
  it("round-trips sRGB colours", () => {
    for (const hex of ["#000000", "#ffffff", "#2f7bff", "#2ecc71", "#f5c400", "#ff3b30", "#0072b2", "#e69f00"]) {
      expect(rgbToHex(oklabToRgb(rgbToOklab(hexToRgb(hex))))).toBe(hex);
    }
  });
  it("white has L≈1 and no chroma", () => {
    const [L, a, b] = rgbToOklab([1, 1, 1]);
    expect(L).toBeCloseTo(1, 3);
    expect(Math.abs(a)).toBeLessThan(1e-3);
    expect(Math.abs(b)).toBeLessThan(1e-3);
  });
  it("mix endpoints return the inputs and clamp t", () => {
    expect(mixOklab("#2f7bff", "#ff3b30", 0)).toBe("#2f7bff");
    expect(mixOklab("#2f7bff", "#ff3b30", 1)).toBe("#ff3b30");
    expect(mixOklab("#2f7bff", "#ff3b30", -2)).toBe("#2f7bff");
    expect(mixOklab("#2f7bff", "#ff3b30", 7)).toBe("#ff3b30");
  });
  it("midpoint is perceptually between the endpoints", () => {
    const [L1] = rgbToOklab(hexToRgb("#000000"));
    const [L2] = rgbToOklab(hexToRgb("#ffffff"));
    const [Lm] = rgbToOklab(hexToRgb(mixOklab("#000000", "#ffffff", 0.5)));
    expect(Lm).toBeCloseTo((L1 + L2) / 2, 2);
  });
  it("background shade is darker", () => {
    const [Lc] = rgbToOklab(hexToRgb("#f5c400"));
    const [Lb] = rgbToOklab(hexToRgb(backgroundShade("#f5c400")));
    expect(Lb).toBeLessThan(Lc);
    expect(Lb).toBeLessThan(0.35);
  });
});

describe("palettes", () => {
  it("default and colour-blind palettes", () => {
    expect(zoneColours("default", {})).toEqual(DEFAULT_ZONES);
    expect(zoneColours("colourblind", { cold: "#123456" })).toEqual(COLOURBLIND_ZONES);
  });
  it("custom uses user colours and falls back per zone", () => {
    expect(zoneColours("custom", { cold: "#123456", normal: "bad" })).toEqual({ ...DEFAULT_ZONES, cold: "#123456" });
  });
});

describe("colourFor (smooth)", () => {
  const c = (v: number) => colourFor(v, Z, DEFAULT_ZONES, "smooth");
  it("hits zone colours exactly at the anchors", () => {
    expect(c(30)).toBe(DEFAULT_ZONES.cold);
    expect(c(50)).toBe(DEFAULT_ZONES.normal); // midpoint of cold and warn
    expect(c(70)).toBe(DEFAULT_ZONES.high);
    expect(c(85)).toBe(DEFAULT_ZONES.crit);
  });
  it("clamps outside the anchors", () => {
    expect(c(0)).toBe(DEFAULT_ZONES.cold);
    expect(c(100)).toBe(DEFAULT_ZONES.crit);
  });
  it("is continuous: no hard steps between adjacent values", () => {
    let prev = c(20)!;
    for (let v = 20.25; v <= 100; v += 0.25) {
      const next = c(v)!;
      expect(dist(prev, next)).toBeLessThan(12);
      prev = next;
    }
  });
  it("interpolates between zones", () => {
    const mid = c(77.5)!;
    expect(mid).not.toBe(DEFAULT_ZONES.high);
    expect(mid).not.toBe(DEFAULT_ZONES.crit);
  });
  it("returns null for neutral sensors or missing values", () => {
    expect(colourFor(5, { min: 0, max: 10, cold: null, warn: null, crit: null }, DEFAULT_ZONES, "smooth")).toBeNull();
    expect(colourFor(null, Z, DEFAULT_ZONES, "smooth")).toBeNull();
    expect(colourFor(Number.NaN, Z, DEFAULT_ZONES, "smooth")).toBeNull();
  });
});

describe("colourFor (stepped)", () => {
  const c = (v: number) => colourFor(v, Z, DEFAULT_ZONES, "stepped");
  it("returns zone colours with hard edges", () => {
    expect(c(25)).toBe(DEFAULT_ZONES.cold);
    expect(c(30)).toBe(DEFAULT_ZONES.normal);
    expect(c(69.9)).toBe(DEFAULT_ZONES.normal);
    expect(c(70)).toBe(DEFAULT_ZONES.high);
    expect(c(85)).toBe(DEFAULT_ZONES.crit);
  });
  it("without a cold limit, low values are normal", () => {
    expect(colourFor(0, { ...Z, cold: null }, DEFAULT_ZONES, "stepped")).toBe(DEFAULT_ZONES.normal);
  });
});

describe("inverted scales (low is bad)", () => {
  const pump = { min: 0, max: 4000, cold: null, warn: 1200, crit: 800 };
  it("low RPM is critical, high RPM is cold/normal", () => {
    expect(colourFor(500, pump, DEFAULT_ZONES, "stepped")).toBe(DEFAULT_ZONES.crit);
    expect(colourFor(1000, pump, DEFAULT_ZONES, "stepped")).toBe(DEFAULT_ZONES.high);
    expect(colourFor(2500, pump, DEFAULT_ZONES, "stepped")).toBe(DEFAULT_ZONES.normal);
    expect(colourFor(4000, pump, DEFAULT_ZONES, "smooth")).toBe(DEFAULT_ZONES.cold);
    expect(colourFor(800, pump, DEFAULT_ZONES, "smooth")).toBe(DEFAULT_ZONES.crit);
  });
  it("heat rises as RPM falls", () => {
    expect(heat(500, pump)).toBeGreaterThan(heat(3000, pump));
  });
});

describe("anchors", () => {
  it("fills a missing warn at two thirds of cold→crit", () => {
    const a = anchors({ min: 0, max: 100, cold: null, warn: null, crit: 90 })!;
    expect(a.map((x) => x.value)).toEqual([0, 30, 60, 90]);
  });
  it("fills a missing crit with the max", () => {
    const a = anchors({ min: 0, max: 100, cold: 10, warn: 70, crit: null })!;
    expect(a[3]!.value).toBe(100);
  });
});
