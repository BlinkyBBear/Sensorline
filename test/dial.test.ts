import { describe, expect, it } from "vitest";
import { adjustPatch, currentSlot, DIAL_VIEWS, effectiveGauge, nextView, rotateIndex, splitTarget, triggerDescription, usesRecommended, windowSamples } from "../src/dial-logic.js";
import { recommendedPatch } from "../src/actions/dial.js";
import { migrateSettings } from "../src/migrate.js";
import { renderStrip } from "../src/render.js";
import { defaultGlobal, parseDial, resolveAppearance } from "../src/settings.js";
import { emptyRuntime, gaugeView } from "../src/view.js";
import layout from "../com.rescuecraftstudio.sensorline.sdPlugin/layouts/strip.json" with { type: "json" };
import manifest from "../com.rescuecraftstudio.sensorline.sdPlugin/manifest.json" with { type: "json" };
import { readFileSync } from "node:fs";

const cpu = { key: "TCPU", id: "TCPU", label: "CPU", raw: "64", type: "temp" as const, numeric: 64, unit: "°C" };
const gpu = { key: "TGPU1", id: "TGPU1", label: "GPU", raw: "71", type: "temp" as const, numeric: 71, unit: "°C" };
const snap = { phase: "live" as const, source: "shared-memory", detail: "", sensors: [cpu, gpu], at: 0 };
const app = resolveAppearance(parseDial({}), defaultGlobal());

describe("dial settings", () => {
  it("has every Gauge option plus dial options", () => {
    const d = parseDial({});
    for (const k of ["sensorKey", "sensorId", "label", "unit", "decimals", "min", "max", "cold", "warn", "crit", "palette", "gradient", "theme", "textSize", "colCold", "colCrit", "smoothing", "holdMinMax", "intervalMs", "alertLevel", "alertFlash", "alertSound", "showZoneGlyph", "showTrend", "expression", "inputs", "mode", "view", "rotateMode", "adjustStep", "windowSamples", "dialPress", "tapAction", "holdAction", "splitKey"]) expect(d).toHaveProperty(k);
    expect(d.palette).toBe("inherit");
    expect(d.view).toBe("bar");
    expect(d.dialPress).toBe("reset");
    expect(d.tapAction).toBe("view");
    expect(d.holdAction).toBe("open-aida64");
  });
  it("raw ID wins as the primary sensor", () => {
    expect(parseDial({ sensorKey: "TCPU", sensorId: "TGPU1", dial1: "SCPUUTI" }).sensors.slice(0, 2)).toEqual(["TGPU1", "SCPUUTI"]);
  });
  it("clamps and validates dial fields", () => {
    const d = parseDial({ view: "nope", windowSamples: 999, windowStep: 0, adjustStep: "-3", tapAction: "explode", index: 42, mode: "formula" });
    expect([d.view, d.windowSamples, d.windowStep, d.adjustStep, d.tapAction, d.index, d.mode]).toEqual(["bar", 120, 1, 0.1, "view", 7, "formula"]);
  });
  it("migrates the earlier dial (dial0..3, recommended limits)", () => {
    const old = { dial0: "TCPU", dial1: "TGPU1", view: "value", rotateMode: "adjust", offsets: { TCPU: 2 } };
    const { settings } = migrateSettings(old);
    const d = parseDial(settings);
    expect(d.sensors.slice(0, 2)).toEqual(["TCPU", "TGPU1"]);
    expect(d.autoLimits).toBe(true);
    expect(d.view).toBe("value");
    expect(effectiveGauge(d, 0, cpu).warn).toBe(72); // recommended 70 + offset 2
    expect(parseDial({}).autoLimits).toBe(false);
  });
});

describe("dial controls", () => {
  const d = parseDial({ sensorKey: "TCPU", dial2: "TGPU1", dial5: "SCPUUTI", warn: 70, crit: 85 });
  it("cycles the user-picked list", () => {
    expect(rotateIndex(d, 1)).toBe(2);
    expect(rotateIndex({ ...d, index: 5 }, 1)).toBe(0);
    expect(rotateIndex(d, -3)).toBe(5);
    expect(currentSlot({ ...d, index: 3 })).toBe(0);
  });
  it("adjusts own thresholds with the step", () => {
    expect(adjustPatch({ ...d, adjustStep: 2.5 }, 0, cpu, 2)).toEqual({ warn: 75, crit: 90 });
    expect(adjustPatch({ ...d, adjustTarget: "crit" }, 0, cpu, -1)).toEqual({ crit: 84 });
    expect(adjustPatch({ ...d, adjustTarget: "warn", warn: null }, 0, cpu, 1)).toBeNull();
  });
  it("adjusts cycle-list sensors with offsets", () => {
    expect(usesRecommended(d, 2)).toBe(true);
    expect(adjustPatch(d, 2, gpu, 3)).toEqual({ offsets: { TGPU1: 3 } });
  });
  it("changes the sparkline window within limits", () => {
    expect(windowSamples(d, 1)).toBe(42);
    expect(windowSamples({ ...d, windowSamples: 12 }, -1)).toBe(10);
    expect(windowSamples({ ...d, windowSamples: 118 }, 5)).toBe(120);
  });
  it("cycles all strip layouts", () => {
    expect(DIAL_VIEWS.map(nextView)).toEqual(["arc", "sparkline", "split", "value", "bar"]);
  });
  it("split uses the chosen sensor, else the next one", () => {
    expect(splitTarget(d, 0)).toBe("TGPU1");
    expect(splitTarget({ ...d, splitKey: "PCPU" }, 0)).toBe("PCPU");
    expect(splitTarget(d, 2)).toBe("TCPU");
  });
  it("describes the triggers in the Stream Deck app", () => {
    expect(triggerDescription(d)).toEqual({ rotate: "Cycle sensors", push: "Reset min/max", touch: "Next view", longTouch: "Open AIDA64" });
    expect(triggerDescription({ ...d, rotateMode: "window", holdAction: "none" })).toMatchObject({ rotate: "Sparkline window", longTouch: "" });
  });
  it("recommended thresholds for a new primary sensor", () => {
    expect(recommendedPatch(cpu, d)).toMatchObject({ unit: "°C", warn: expect.any(Number), crit: expect.any(Number) });
  });
});

describe("touch strip", () => {
  const d = parseDial({ sensorKey: "TCPU", warn: 60, crit: 85, holdMinMax: true });
  const rt = { ...emptyRuntime(), value: 64, history: [60, 62, 64], min: 50, max: 70, trend: "up" as const };
  const v = gaugeView(d, app, snap, rt, cpu, "TCPU");
  const second = { title: "GPU", valueText: "71", unit: "°C", fraction: 0.6, color: "#f5c400", zone: "high" as const };
  for (const view of DIAL_VIEWS) {
    it(`${view}: stays within 200 × 100 and keeps the zone symbol and trend`, () => {
      const svg = renderStrip(v, view, "1/2", second);
      expect(svg).toContain('viewBox="0 0 200 100"');
      for (const m of svg.matchAll(/\b(x|cx)="(-?[\d.]+)"/g)) expect(Number(m[2])).toBeGreaterThanOrEqual(0), expect(Number(m[2])).toBeLessThanOrEqual(200);
      for (const m of svg.matchAll(/\b(y|cy)="(-?[\d.]+)"/g)) expect(Number(m[2])).toBeGreaterThanOrEqual(0), expect(Number(m[2])).toBeLessThanOrEqual(100);
      for (const m of svg.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)) expect(Number(m[1]) + Number(m[2])).toBeLessThanOrEqual(200);
      for (const m of svg.matchAll(/font-size="([\d.]+)"/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(13);
      expect(svg).toContain('data-glyph="high"');
      expect(svg).toContain('data-trend="up"');
    });
  }
  it("split shows both sensors", () => {
    const svg = renderStrip(v, "split", "", second);
    expect(svg).toContain(">GPU<");
    expect(svg).toContain(">CPU<");
  });
  it("shows setup help when AIDA64 is absent", () => {
    const off = gaugeView(d, app, { ...snap, phase: "not-running", sensors: [] }, rt, undefined, "TCPU");
    expect(renderStrip(off, "arc", "")).toContain("Start AIDA64");
  });
  it("flashes the strip on alert", () => {
    const f = gaugeView({ ...d, alertLevel: "high" }, app, snap, { ...rt, flash: true }, cpu, "TCPU");
    expect(renderStrip(f, "bar", "")).toContain(`fill="${app.colours.crit}"`);
  });
});

describe("dial manifest, layout and inspector", () => {
  it("custom layout fits the touch strip", () => {
    for (const item of layout.items) {
      const [x, y, w, h] = item.rect;
      expect(x! + w!).toBeLessThanOrEqual(200);
      expect(y! + h!).toBeLessThanOrEqual(100);
    }
  });
  it("manifest describes every trigger", () => {
    const dial = manifest.Actions.find((a) => a.UUID.endsWith(".dial")) as { Encoder: { layout: string; TriggerDescription: Record<string, string> } };
    expect(dial.Encoder.layout).toBe("layouts/strip.json");
    expect(Object.keys(dial.Encoder.TriggerDescription).sort()).toEqual(["LongTouch", "Push", "Rotate", "Touch"]);
  });
  it("inspector has every option, each with a tooltip", () => {
    const html = readFileSync("com.rescuecraftstudio.sensorline.sdPlugin/ui/dial.html", "utf8");
    const items = html.match(/<sdpi-item[^>]*>/g) ?? [];
    expect(items.every((t) => / title="[^"]+"/.test(t))).toBe(true);
    for (const s of ["mode", "preset", "sensorKey", "sensorId", "dial1", "dial7", "expression", "in0", "in7", "label", "unit", "decimals", "min", "max", "cold", "warn", "crit", "palette", "gradient", "colCold", "colNormal", "colHigh", "colCrit", "theme", "textSize", "smoothing", "holdMinMax", "intervalMs", "alertLevel", "alertFlash", "alertSound", "showZoneGlyph", "showTrend", "view", "splitKey", "rotateMode", "adjustTarget", "adjustStep", "windowSamples", "windowStep", "dialPress", "tapAction", "holdAction", "autoLimits", "g_palette", "g_theme"]) {
      expect(html, s).toContain(`setting="${s}"`);
    }
    for (const id of ["sensorSearch", "previewButton", "recommendButton", "exportButton", "importButton", "status", "validation", "formulaResult"]) expect(html, id).toContain(`id="${id}"`);
    expect(html).toContain("Setup help");
  });
});
