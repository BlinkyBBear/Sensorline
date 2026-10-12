import { describe, expect, it } from "vitest";
import { activeSlots, rotateIndex } from "../src/actions/dial.js";
import { previewValues } from "../src/actions/common.js";
import { bestMatch, presetSettings } from "../src/actions/presets.js";
import { slowTier } from "../src/poller.js";
import { defaultDial, defaultGlobal, parseGauge, parseGlobal, resolveAppearance } from "../src/settings.js";
import { trendOf } from "../src/stats.js";
import { COLOURBLIND_ZONES } from "../src/colour.js";
import { zoneOf } from "../src/colour.js";

const s = (id: string, label: string, type: "temp" | "sys" | "fan" | "pwr", unit: string) => ({ key: id, id, label, raw: "1", type, numeric: 1, unit });
const snap = {
  phase: "live" as const, source: "shared-memory", detail: "",
  sensors: [s("TMOBO", "Motherboard", "temp", "°C"), s("TCPU", "CPU", "temp", "°C"), s("TGPU1HOT", "GPU Hotspot", "temp", "°C"), s("TGPU1", "GPU Diode", "temp", "°C"), s("SCPUUTI", "CPU Utilization", "sys", "%"), s("SMEMUTI", "Memory Utilization", "sys", "%"), s("SGPU1UTI", "GPU Utilization", "sys", "%"), s("FPUMP", "Pump", "fan", "RPM"), s("FCPU", "CPU", "fan", "RPM"), s("PCPUPKG", "CPU Package", "pwr", "W")],
};

describe("one-click presets", () => {
  it.each([
    ["cpu-temp", "TCPU"], ["gpu-temp", "TGPU1"], ["cpu-load", "SCPUUTI"], ["gpu-load", "SGPU1UTI"], ["ram", "SMEMUTI"], ["fan", "FCPU"], ["power", "PCPUPKG"],
  ] as const)("%s picks %s", (kind, id) => {
    expect(bestMatch(kind, snap)?.id).toBe(id);
  });
  it("user values override preset values; empty means preset", () => {
    expect(presetSettings("cpu-temp", { warn: 60, crit: "" })).toMatchObject({ warn: 60, crit: 85, min: 20 });
  });
});

describe("global defaults", () => {
  it("inherit resolves from global settings, explicit values win", () => {
    const g = parseGlobal({ g_palette: "colourblind", g_theme: "high-contrast", g_textSize: "large" });
    const key = parseGauge({});
    expect(resolveAppearance(key, g)).toMatchObject({ palette: "colourblind", theme: "high-contrast", textSize: "large", colours: COLOURBLIND_ZONES });
    expect(resolveAppearance({ ...key, theme: "dark" }, g).theme).toBe("dark");
  });
  it("custom colours come from where Custom was chosen", () => {
    const g = { ...defaultGlobal(), palette: "custom" as const, colCold: "#010203" };
    expect(resolveAppearance(parseGauge({}), g).colours.cold).toBe("#010203");
    expect(resolveAppearance(parseGauge({ palette: "custom", colCold: "#0a0b0c" }), g).colours.cold).toBe("#0a0b0c");
  });
});

describe("poller tiers", () => {
  it("slows down while AIDA64 is absent", () => {
    expect(slowTier("not-running")).toBe(true);
    expect(slowTier("sharing-off")).toBe(true);
    expect(slowTier("live")).toBe(false);
    expect(slowTier("error")).toBe(false);
  });
});

describe("dial", () => {
  it("rotates through configured sensors only", () => {
    const d = { ...defaultDial(), sensors: ["TCPU", "", "TGPU1", "SCPUUTI"], index: 0 };
    expect(activeSlots(d)).toEqual([0, 2, 3]);
    expect(rotateIndex(d, 1)).toBe(2);
    expect(rotateIndex({ ...d, index: 3 }, 1)).toBe(0);
    expect(rotateIndex(d, -1)).toBe(3);
  });
});

describe("preview and trend", () => {
  it("preview values hit every zone", () => {
    const z = { min: 20, max: 100, cold: 30, warn: 70, crit: 85 };
    expect(previewValues(z).map((v) => zoneOf(v, z))).toEqual(["cold", "normal", "high", "crit"]);
  });
  it("trend uses a dead band", () => {
    expect(trendOf([50, 50.1, 49.9, 50, 50.05], 80)).toBe("flat");
    expect(trendOf([50, 52, 54, 56, 58], 80)).toBe("up");
    expect(trendOf([58, 56, 54, 52, 50], 80)).toBe("down");
  });
});
