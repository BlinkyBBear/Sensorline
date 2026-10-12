import { describe, expect, it } from "vitest";
import { migrateSettings } from "../src/migrate.js";
import { parseGauge, parseMulti, SCHEMA } from "../src/settings.js";
import { presetSettings } from "../src/actions/presets.js";

describe("settings migration", () => {
  it("1.0 gauge: adds schema, follows global colour defaults, converts number strings", () => {
    const v10 = { sensorKey: "TCPU", style: "radial", min: "0", max: "100", cold: "", warn: "75", crit: "90", colorMode: "threshold", background: "heat", solid: "#d7dbe3", intervalMs: "1000", showLabel: true };
    const { settings, from, changed } = migrateSettings(v10);
    expect(from).toBe("1.0");
    expect(changed).toBe(true);
    expect(settings).toMatchObject({ schema: SCHEMA, sensorKey: "TCPU", min: 0, max: 100, cold: null, warn: 75, crit: 90, palette: "inherit", gradient: "inherit", theme: "inherit", textSize: "inherit" });
    expect(parseGauge(settings)).toMatchObject({ sensorKey: "TCPU", warn: 75, crit: 90, palette: "inherit" });
  });

  it("1.0 multi: slots array becomes slot0..3 / slotLabel0..3", () => {
    const v10 = { count: 3, slots: [{ sensorKey: "TCPU", label: "CPU" }, { sensorKey: "TGPU1", label: "" }, { sensorKey: "SMEMUTI", label: "RAM" }, { sensorKey: "", label: "" }], decimals: 0, intervalMs: 1000 };
    const { settings } = migrateSettings(v10);
    expect(settings.slots).toBeUndefined();
    expect(settings).toMatchObject({ slot0: "TCPU", slotLabel0: "CPU", slot1: "TGPU1", slot2: "SMEMUTI", slotLabel2: "RAM" });
    const m = parseMulti(settings);
    expect(m.count).toBe(3);
    expect(m.slots.slice(0, 3).map((s) => s.sensorKey)).toEqual(["TCPU", "TGPU1", "SMEMUTI"]);
  });

  it("1.0 preset (monitor) key keeps its thresholds", () => {
    const v10 = { style: "bar", label: "CPU", cold: 20, warn: 70, crit: 90, intervalMs: 500 };
    const s = presetSettings("cpu-load", migrateSettings(v10).settings as never);
    expect(s).toMatchObject({ style: "bar", label: "CPU", cold: 20, warn: 70, crit: 90, intervalMs: 500 });
  });

  it("1.1 keeps explicit colour choices", () => {
    const v11 = { sensorKey: "TGPU1HOT", palette: "custom", gradient: "stepped", colCold: "#112233", colCrit: "#abcdef", warn: 90, crit: 105 };
    const { settings, from } = migrateSettings(v11);
    expect(from).toBe("1.1");
    expect(settings).toMatchObject({ schema: SCHEMA, palette: "custom", gradient: "stepped", colCold: "#112233", colCrit: "#abcdef", theme: "inherit" });
  });

  it("current settings are left alone", () => {
    const cur = { schema: SCHEMA, palette: "default", theme: "dark" };
    expect(migrateSettings(cur)).toEqual({ settings: cur, from: "current", changed: false });
  });

  it("is idempotent", () => {
    const once = migrateSettings({ warn: "70" }).settings;
    expect(migrateSettings(once).changed).toBe(false);
  });

  it("tolerates junk", () => {
    expect(migrateSettings(null).settings.schema).toBe(SCHEMA);
    expect(migrateSettings([1, 2]).settings.schema).toBe(SCHEMA);
  });
});
