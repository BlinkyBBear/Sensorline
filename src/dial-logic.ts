/** Pure Sensor Dial logic (no SDK calls), so it can be unit-tested. */
import { recommend } from "./sensors/thresholds.js";
import type { Sensor } from "./sensors/types.js";
import { type DialSettings, type DialTrigger, type DialView, type GaugeSettings, WINDOW_MAX, WINDOW_MIN } from "./settings.js";

export const DIAL_VIEWS: DialView[] = ["bar", "arc", "sparkline", "split", "value"];

/** Indices of configured sensors in the cycle list. */
export function activeSlots(s: Pick<DialSettings, "sensors">): number[] {
  return s.sensors.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
}

/** The slot actually shown: the stored index if configured, else the first configured one. */
export function currentSlot(s: Pick<DialSettings, "sensors" | "index">): number {
  const slots = activeSlots(s);
  return slots.includes(s.index) ? s.index : (slots[0] ?? 0);
}

/** Next configured slot when rotating by `ticks` (one step per event, direction from the sign). */
export function rotateIndex(s: Pick<DialSettings, "sensors" | "index">, ticks: number): number {
  const slots = activeSlots(s);
  if (slots.length === 0) return 0;
  const at = Math.max(0, slots.indexOf(currentSlot(s)));
  const next = (((at + Math.sign(ticks)) % slots.length) + slots.length) % slots.length;
  return slots[next]!;
}

export function nextView(view: DialView): DialView {
  return DIAL_VIEWS[(DIAL_VIEWS.indexOf(view) + 1) % DIAL_VIEWS.length]!;
}

/** True when this slot uses recommended limits (+offset) rather than the inspector fields. */
export function usesRecommended(s: DialSettings, slot: number): boolean {
  return s.mode === "sensor" && (slot !== 0 || s.autoLimits);
}

/** Gauge settings for the slot being shown: own fields for the primary sensor / formula, recommended limits otherwise. */
export function effectiveGauge(s: DialSettings, slot: number, sensor: Sensor | undefined): GaugeSettings {
  if (!sensor || !usesRecommended(s, slot)) return s;
  const rec = recommend(sensor);
  const off = s.offsets[sensor.key] ?? 0;
  return {
    ...s,
    sensorKey: sensor.key,
    sensorId: "",
    label: slot === 0 ? s.label : "",
    unit: slot === 0 && s.unit ? s.unit : rec.unit,
    decimals: slot === 0 ? s.decimals : rec.decimals,
    min: rec.min,
    max: rec.max === rec.min ? rec.min + 1 : rec.max,
    cold: rec.cold,
    warn: rec.warn === null ? null : rec.warn + off,
    crit: rec.crit === null ? null : rec.crit + off,
    colorMode: rec.warn === null && rec.crit === null ? "solid" : "threshold",
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Settings patch for rotating in "adjust" mode. Own-field slots change High /
 * Critical directly (the inspector shows the new values); recommended slots
 * store a per-sensor offset. Returns null when there is nothing to adjust.
 */
export function adjustPatch(s: DialSettings, slot: number, sensor: Sensor | undefined, ticks: number): Record<string, unknown> | null {
  const delta = ticks * s.adjustStep;
  if (usesRecommended(s, slot)) {
    if (!sensor) return null;
    const rec = recommend(sensor);
    if (rec.warn === null && rec.crit === null) return null;
    return { offsets: { ...s.offsets, [sensor.key]: round2((s.offsets[sensor.key] ?? 0) + delta) } };
  }
  const patch: Record<string, unknown> = {};
  if (s.adjustTarget !== "crit" && s.warn !== null) patch.warn = round2(s.warn + delta);
  if (s.adjustTarget !== "warn" && s.crit !== null) patch.crit = round2(s.crit + delta);
  return Object.keys(patch).length ? patch : null;
}

export function windowSamples(s: DialSettings, ticks: number): number {
  return Math.max(WINDOW_MIN, Math.min(WINDOW_MAX, s.windowSamples + Math.sign(ticks) * s.windowStep * Math.max(1, Math.abs(Math.round(ticks)))));
}

/** Sensor for the right half of the split view: the chosen one, else the next sensor in the list. */
export function splitTarget(s: DialSettings, slot: number): string {
  if (s.splitKey) return s.splitKey;
  if (s.mode === "formula") return s.sensors[0] ?? "";
  const slots = activeSlots(s).filter((i) => i !== slot);
  return slots.length ? s.sensors[slots[0]!]! : "";
}

const TRIGGER_TEXT: Record<DialTrigger, string> = {
  reset: "Reset min/max",
  view: "Next view",
  next: "Next sensor",
  refresh: "Refresh",
  "open-aida64": "Open AIDA64",
  none: "",
};

/** Stream Deck + trigger description shown in the app for the current settings. */
export function triggerDescription(s: DialSettings): { rotate: string; push: string; touch: string; longTouch: string } {
  const rotate = s.rotateMode === "cycle" ? "Cycle sensors" : s.rotateMode === "window" ? "Sparkline window" : s.adjustTarget === "both" ? "Adjust High/Critical" : s.adjustTarget === "warn" ? "Adjust High" : "Adjust Critical";
  return { rotate, push: TRIGGER_TEXT[s.dialPress], touch: TRIGGER_TEXT[s.tapAction], longTouch: TRIGGER_TEXT[s.holdAction] };
}
