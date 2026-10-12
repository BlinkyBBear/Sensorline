import { describe, expect, it } from "vitest";
import { type AlertConfig, inAlertZone, newAlertState, stepAlert } from "../src/alerts.js";
import { zoneOf } from "../src/colour.js";

const cfg: AlertConfig = { level: "crit", flash: true, sound: true, confirm: 2, soundCooldownMs: 30_000 };

describe("alerts", () => {
  it("zone levels", () => {
    expect(inAlertZone("off", "crit")).toBe(false);
    expect(inAlertZone("crit", "high")).toBe(false);
    expect(inAlertZone("crit", "crit")).toBe(true);
    expect(inAlertZone("high", "high")).toBe(true);
    expect(inAlertZone("high", "normal")).toBe(false);
    expect(inAlertZone("high", null)).toBe(false);
  });

  it("debounces: fires after `confirm` samples and plays the sound once", () => {
    const st = newAlertState();
    const a = stepAlert(st, cfg, "crit", 0);
    expect(a.active).toBe(false);
    const b = stepAlert(st, cfg, "crit", 1000);
    expect(b).toMatchObject({ active: true, started: true, playSound: true, flashOn: true });
    const c = stepAlert(st, cfg, "crit", 2000);
    expect(c).toMatchObject({ active: true, started: false, playSound: false, flashOn: false });
    const d = stepAlert(st, cfg, "crit", 3000);
    expect(d.flashOn).toBe(true);
  });

  it("hysteresis: clears only after `confirm` samples out of the zone", () => {
    const st = newAlertState();
    stepAlert(st, cfg, "crit", 0);
    stepAlert(st, cfg, "crit", 1);
    expect(stepAlert(st, cfg, "high", 2).active).toBe(true);
    expect(stepAlert(st, cfg, "crit", 3).active).toBe(true);
    expect(stepAlert(st, cfg, "normal", 4).active).toBe(true);
    const off = stepAlert(st, cfg, "normal", 5);
    expect(off.active).toBe(false);
    expect(off.flashOn).toBe(false);
  });

  it("sound cooldown", () => {
    const st = newAlertState();
    const fire = (t: number) => {
      stepAlert(st, cfg, "crit", t);
      const r = stepAlert(st, cfg, "crit", t + 1);
      stepAlert(st, cfg, "normal", t + 2);
      stepAlert(st, cfg, "normal", t + 3);
      return r.playSound;
    };
    expect(fire(0)).toBe(true);
    expect(fire(10_000)).toBe(false);
    expect(fire(40_000)).toBe(true);
  });

  it("no flash or sound when disabled", () => {
    const st = newAlertState();
    const quiet = { ...cfg, flash: false, sound: false };
    stepAlert(st, quiet, "crit", 0);
    expect(stepAlert(st, quiet, "crit", 1)).toMatchObject({ active: true, flashOn: false, playSound: false });
  });

  it("works with inverted (low is bad) zones", () => {
    const pump = { min: 0, max: 4000, cold: null, warn: 1200, crit: 800 };
    expect(zoneOf(600, pump)).toBe("crit");
    expect(zoneOf(1000, pump)).toBe("high");
    expect(zoneOf(2500, pump)).toBe("normal");
  });
});
