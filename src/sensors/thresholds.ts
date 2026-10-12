import { niceMax } from "./parse.js";
import type { GaugeStyle, Sensor } from "./types.js";

/**
 * Suggested scale and colour zones for a sensor.
 * Zones: below `cold` is Cold (blue), up to `warn` is Normal (green),
 * from `warn` is High (yellow) and from `crit` is Critical (red).
 * When `crit` < `warn` the scale is inverted (low values are bad, e.g. pump RPM).
 * `warn` and `crit` both null means "neutral": no zone colouring.
 */
export interface Recommendation {
  /** Short name of the rule that matched, for debugging and tests. */
  rule: string;
  min: number;
  max: number;
  cold: number | null;
  warn: number | null;
  crit: number | null;
  unit: string;
  decimals: number;
  style: GaugeStyle;
}

type Base = Omit<Recommendation, "unit" | "rule"> & { unit?: string };

interface Rule {
  name: string;
  test: (s: Sensor, id: string, text: string, unit: string) => boolean;
  make: (s: Sensor, unit: string) => Base;
}

const temp = (min: number, max: number, cold: number, warn: number, crit: number): Base => ({
  min, max, cold, warn, crit, unit: "°C", decimals: 0, style: "radial",
});

const isTemp = (s: Sensor, unit: string): boolean => s.type === "temp" || unit === "°C" || unit === "°F";

/**
 * Ordered rules: the first match wins. IDs follow AIDA64's External Applications
 * naming (TCPU, TGPU1HOT, SCPUUTI, PCPUPKG, …). Values come from vendor limits;
 * see docs/thresholds.md.
 */
export const RULES: Rule[] = [
  // ---- temperatures -------------------------------------------------------
  { name: "gpu-hotspot", test: (s, id, t, u) => isTemp(s, u) && (/^TGPU\d*(HOT|MEM)/.test(id) || /HOT ?SPOT|JUNCTION|GPU MEMORY/.test(t)),
    make: () => temp(20, 115, 35, 90, 105) },
  { name: "gpu-temp", test: (s, id, t, u) => isTemp(s, u) && (/^TGPU/.test(id) || /\bGPU\b/.test(t)),
    make: () => temp(20, 100, 30, 75, 85) },
  { name: "vrm-temp", test: (s, id, t, u) => isTemp(s, u) && /VRM|MOS|MOSFET/.test(`${id} ${t}`),
    make: () => temp(20, 125, 30, 80, 100) },
  { name: "coolant-temp", test: (s, id, t, u) => isTemp(s, u) && /COOLANT|LIQUID|WATER|TLIQ/.test(`${id} ${t}`),
    make: () => temp(15, 60, 25, 40, 50) },
  { name: "nvme-temp", test: (s, id, t, u) => isTemp(s, u) && /NVME|SSD|M\.2/.test(`${id} ${t}`),
    make: () => temp(20, 90, 30, 50, 70) },
  { name: "hdd-temp", test: (s, id, _t, u) => isTemp(s, u) && /^THDD/.test(id),
    make: () => temp(15, 65, 25, 45, 55) },
  { name: "dimm-temp", test: (s, id, t, u) => isTemp(s, u) && (/^TDIMM/.test(id) || /\bDIMM\b|MEMORY/.test(t)),
    make: () => temp(20, 95, 30, 60, 80) },
  { name: "chipset-temp", test: (s, id, t, u) => isTemp(s, u) && /CHIPSET|PCH|^TCHIP/.test(`${id} ${t}`),
    make: () => temp(20, 100, 30, 70, 85) },
  { name: "cpu-temp", test: (s, id, t, u) => isTemp(s, u) && (/^T(CPU|CC)/.test(id) || /CPU|CORE|PACKAGE|TCTL|TDIE/.test(t)),
    make: () => temp(20, 100, 30, 70, 85) },
  { name: "temp", test: (s, _id, _t, u) => isTemp(s, u),
    make: (_s, u) => ({ ...temp(20, 100, 30, 75, 90), unit: u || "°C" }) },

  // ---- utilisation and percentages ---------------------------------------
  { name: "gpu-tdp-percent", test: (_s, id) => /^PGPU\d*TDPP$/.test(id),
    make: () => ({ min: 0, max: 100, cold: 10, warn: 80, crit: 95, unit: "%", decimals: 0, style: "radial" }) },
  { name: "utilisation", test: (_s, id) => /UTI$|ACT$/.test(id),
    make: () => ({ min: 0, max: 100, cold: 10, warn: 75, crit: 90, unit: "%", decimals: 0, style: "radial" }) },
  { name: "duty", test: (s, _id, _t, u) => s.type === "duty" || u === "%",
    make: () => ({ min: 0, max: 100, cold: null, warn: null, crit: null, unit: "%", decimals: 0, style: "radial" }) },

  // ---- cooling ------------------------------------------------------------
  { name: "pump-rpm", test: (s, id, t, u) => (s.type === "fan" || u === "RPM") && /PUMP/.test(`${id} ${t}`),
    make: (s) => ({ min: 0, max: niceMax(Math.max(3000, (s.numeric ?? 2000) * 1.6)), cold: null, warn: 1200, crit: 800, unit: "RPM", decimals: 0, style: "radial" }) },
  { name: "fan-rpm", test: (s, _id, _t, u) => s.type === "fan" || u === "RPM",
    make: (s) => ({ min: 0, max: niceMax(Math.max(1500, (s.numeric ?? 1200) * 1.6)), cold: null, warn: null, crit: null, unit: "RPM", decimals: 0, style: "radial" }) },

  // ---- power --------------------------------------------------------------
  { name: "cpu-power", test: (s, id, _t, u) => (s.type === "pwr" || u === "W") && /^PCPU/.test(id),
    make: () => ({ min: 0, max: 250, cold: 15, warn: 125, crit: 200, unit: "W", decimals: 1, style: "radial" }) },
  { name: "gpu-power", test: (s, id, _t, u) => (s.type === "pwr" || u === "W") && /^PGPU/.test(id),
    make: () => ({ min: 0, max: 450, cold: 30, warn: 360, crit: 428, unit: "W", decimals: 1, style: "radial" }) },
  { name: "power", test: (s, _id, _t, u) => s.type === "pwr" || u === "W",
    make: (s) => ({ min: 0, max: niceMax(Math.max(100, (s.numeric ?? 50) * 1.8)), cold: null, warn: null, crit: null, unit: "W", decimals: 1, style: "value" }) },

  // ---- neutral electrical / clocks / throughput --------------------------
  { name: "voltage", test: (s, _id, _t, u) => s.type === "volt" || u === "V",
    make: (s) => ({ min: 0, max: niceMax(Math.max(2, (s.numeric ?? 1) * 1.5)), cold: null, warn: null, crit: null, unit: "V", decimals: 3, style: "value" }) },
  { name: "current", test: (s, _id, _t, u) => s.type === "curr" || u === "A",
    make: (s) => ({ min: 0, max: niceMax(Math.max(10, (s.numeric ?? 1) * 1.8)), cold: null, warn: null, crit: null, unit: "A", decimals: 2, style: "value" }) },
  { name: "clock", test: (_s, id, _t, u) => /CLK$/.test(id) || u === "MHz",
    make: (s) => ({ min: 0, max: niceMax(Math.max(1000, (s.numeric ?? 1000) * 1.3)), cold: null, warn: null, crit: null, unit: "MHz", decimals: 0, style: "value" }) },
  { name: "throughput", test: (_s, id, _t, u) => /RATE$|SPD$/.test(id) || /^[KMG]?B\/s$/i.test(u),
    make: (s) => ({ min: 0, max: niceMax(Math.max(100, Math.abs(s.numeric ?? 1) * 2)), cold: null, warn: null, crit: null, decimals: 1, style: "sparkline" }) },
];

/** Picks scale and zone defaults for a sensor. Backend hints (e.g. lm-sensors limits) win. */
export function recommend(sensor: Sensor): Recommendation {
  const id = sensor.id.toUpperCase();
  const text = sensor.label.toUpperCase();
  const unit = sensor.hint?.unit || sensor.unit;
  let base: Base;
  let rule = "fallback";
  const match = RULES.find((r) => r.test(sensor, id, text, unit));
  if (match) {
    base = match.make(sensor, unit);
    rule = match.name;
  } else if (sensor.numeric === null) {
    base = { min: 0, max: 1, cold: null, warn: null, crit: null, decimals: 0, style: "value" };
  } else {
    base = {
      min: 0,
      max: niceMax(Math.max(10, Math.abs(sensor.numeric) * 1.5)),
      cold: null, warn: null, crit: null,
      decimals: Number.isInteger(sensor.numeric) ? 0 : 1,
      style: "value",
    };
  }
  const hint = sensor.hint;
  return {
    rule,
    min: hint?.min ?? base.min,
    max: hint?.max ?? base.max,
    cold: hint?.cold === undefined ? base.cold : hint.cold,
    warn: hint?.warn === undefined ? base.warn : hint.warn,
    crit: hint?.crit === undefined ? base.crit : hint.crit,
    unit: hint?.unit ?? base.unit ?? unit,
    decimals: hint?.decimals ?? base.decimals,
    style: hint?.style ?? base.style,
  };
}

export function isNeutral(rec: { warn: number | null; crit: number | null }): boolean {
  return rec.warn === null && rec.crit === null;
}
