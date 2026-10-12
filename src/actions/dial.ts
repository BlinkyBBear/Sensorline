import { action, type DialAction, type DialDownEvent, type DialRotateEvent, type DidReceiveSettingsEvent, type TouchTapEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { zoneOf } from "../colour.js";
import { adjustPatch, currentSlot, effectiveGauge, nextView, rotateIndex, splitTarget, triggerDescription, windowSamples } from "../dial-logic.js";
import { alert, ensureStarted, forgetImage, getGlobals, peek, poller, previewValue, pushStatus, register, release, resetMinMax, sample, setImageIfChanged, setKeyInterval, startPreview } from "../hub.js";
import { openAida64 } from "../platform.js";
import { renderStrip, type StripSide } from "../render.js";
import { recommend } from "../sensors/thresholds.js";
import type { Sensor } from "../sensors/types.js";
import { applyRecommendation, type DialSettings, type DialTrigger, formatNumber, parseDial, resolveAppearance, type ResolvedAppearance } from "../settings.js";
import { arcColour, findSensor, fraction, gaugeView, truncate } from "../view.js";
import { migrateOnAppear, previewValues } from "./common.js";
import { evaluateFormula } from "./formula.js";
import { bestMatch, PRESETS, type PresetKind } from "./presets.js";
import { InspectorAction } from "./inspector.js";

export { activeSlots, rotateIndex } from "../dial-logic.js";
export const DIAL_UUID = "com.rescuecraftstudio.sensorline.dial";

/** The right half of the split view, from the raw reading (no smoothing). */
function sideFor(key: string, app: ResolvedAppearance, s: DialSettings): StripSide | undefined {
  const sensor = findSensor(poller.snapshot, key);
  if (!sensor) return key ? { title: truncate(key, 10), valueText: "—", unit: "", fraction: null, color: "#5a616d", zone: null } : undefined;
  const rec = recommend(sensor);
  const zones = { min: rec.min, max: rec.max, cold: rec.cold, warn: rec.warn, crit: rec.crit };
  const mode = rec.warn === null && rec.crit === null ? "solid" : s.colorMode;
  return {
    title: truncate(sensor.label, 10),
    valueText: sensor.numeric === null ? truncate(sensor.raw, 8) : formatNumber(sensor.numeric, rec.decimals),
    unit: sensor.numeric === null ? "" : rec.unit,
    fraction: fraction(sensor.numeric, rec.min, rec.max),
    color: arcColour(sensor.numeric, zones, app, mode, s.solid),
    zone: mode === "threshold" ? zoneOf(sensor.numeric, zones) : null,
  };
}

/**
 * Stream Deck + dial with the full Gauge option set plus dial controls. Uses a
 * custom layout with one 200 × 100 pixmap; feedback is only sent when the
 * rendered strip changes.
 */
@action({ UUID: DIAL_UUID })
export class DialSensorAction extends InspectorAction {
  private raw = new Map<string, JsonObject>();
  private triggers = new Map<string, string>();
  private dials = new Map<string, DialAction<JsonObject>>();

  private settings(id: string): DialSettings {
    return parseDial(this.raw.get(id));
  }

  private async save(dial: DialAction<JsonObject>, patch: Record<string, unknown>): Promise<void> {
    const next = { ...(this.raw.get(dial.id) ?? {}), ...patch } as JsonObject;
    this.raw.set(dial.id, next);
    await dial.setSettings(next);
  }

  override async onWillAppear(ev: WillAppearEvent<JsonObject>): Promise<void> {
    if (!ev.action.isDial()) return;
    const dial = ev.action;
    this.dials.set(dial.id, dial);
    this.raw.set(dial.id, await migrateOnAppear(dial, ev.payload.settings));
    register(dial.id, (fresh) => this.paint(dial, fresh), this.settings(dial.id).intervalMs);
    await dial.setFeedbackLayout("layouts/strip.json");
    await this.describe(dial);
    await ensureStarted();
    await this.paint(dial, false);
  }

  override async onWillDisappear(ev: WillDisappearEvent<JsonObject>): Promise<void> {
    this.raw.delete(ev.action.id);
    this.triggers.delete(ev.action.id);
    this.dials.delete(ev.action.id);
    await release(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): Promise<void> {
    const before = this.raw.has(ev.action.id) ? this.settings(ev.action.id) : undefined;
    let raw = ev.payload.settings;
    this.raw.set(ev.action.id, raw);
    const next = this.settings(ev.action.id);
    // One-click preset: pick the best matching sensor and its recommended limits.
    const preset = typeof raw.preset === "string" ? (raw.preset as PresetKind) : "";
    if (preset && preset in PRESETS) {
      const sensor = bestMatch(preset, poller.snapshot);
      raw = { ...raw, ...PRESETS[preset], style: "bar", preset: "", sensorId: "", sensorKey: sensor?.key ?? "", mode: "sensor", autoLimits: false, index: 0 };
      if (!sensor && ev.action.isDial()) await ev.action.showAlert();
      await this.save(ev.action as DialAction<JsonObject>, raw);
    } else if (before && next.sensors[0] && next.sensors[0] !== before.sensors[0]) {
      // New primary sensor: fill in suggested limits, as the Gauge key does.
      const sensor = findSensor(poller.snapshot, next.sensors[0]);
      if (sensor) await this.save(ev.action as DialAction<JsonObject>, recommendedPatch(sensor, next));
    }
    setKeyInterval(ev.action.id, this.settings(ev.action.id).intervalMs);
    forgetImage(ev.action.id);
    if (ev.action.isDial()) {
      await this.describe(ev.action);
      await this.paint(ev.action, false);
    }
    await this.pushExtraStatus(ev.action.id);
  }

  override async onDialRotate(ev: DialRotateEvent<JsonObject>): Promise<void> {
    const s = this.settings(ev.action.id);
    const slot = currentSlot(s);
    if (s.rotateMode === "window") {
      await this.save(ev.action, { windowSamples: windowSamples(s, ev.payload.ticks) });
    } else if (s.rotateMode === "adjust") {
      const patch = adjustPatch(s, slot, this.sensorAt(s, slot), ev.payload.ticks);
      if (!patch) return ev.action.showAlert();
      await this.save(ev.action, patch);
    } else {
      if (s.mode === "formula") return ev.action.showAlert();
      await this.save(ev.action, { index: rotateIndex(s, ev.payload.ticks) });
    }
    await this.paint(ev.action, false);
  }

  override async onDialDown(ev: DialDownEvent<JsonObject>): Promise<void> {
    await this.run(ev.action, this.settings(ev.action.id).dialPress);
  }

  override async onTouchTap(ev: TouchTapEvent<JsonObject>): Promise<void> {
    const s = this.settings(ev.action.id);
    await this.run(ev.action, ev.payload.hold ? s.holdAction : s.tapAction);
  }

  protected override async onInspectorMessage(id: string, event: string): Promise<void> {
    const s = this.settings(id);
    const dial = this.dials.get(id);
    if (event === "recommend" && dial) {
      // "Use recommended thresholds" for the primary sensor.
      const sensor = s.mode === "sensor" ? findSensor(poller.snapshot, s.sensors[0] ?? "") : undefined;
      if (!sensor) return dial.showAlert();
      await this.save(dial, { ...recommendedPatch(sensor, s), autoLimits: false });
      forgetImage(id);
      await this.paint(dial, false);
      return;
    }
    if (event === "preview") startPreview(id, previewValues(effectiveGauge(s, currentSlot(s), this.sensorAt(s, currentSlot(s)))));
  }

  protected override async pushExtraStatus(id: string): Promise<void> {
    if (!this.raw.has(id)) return pushStatus();
    const s = this.settings(id);
    if (s.mode === "formula") {
      const r = evaluateFormula(s, poller.snapshot);
      return pushStatus(r.error ? { validation: r.error } : { formula: r.value === null ? "Waiting for inputs" : `= ${formatNumber(r.value, s.decimals)}` });
    }
    const missing = s.sensors.filter((k) => k && !findSensor(poller.snapshot, k));
    await pushStatus(missing.length && poller.snapshot.phase === "live" ? { validation: `Not found in AIDA64: ${missing.join(", ")}` } : {});
  }

  /** Runs a press / tap / long-touch action. The SDK has no showOk for dials, so only failures give feedback. */
  private async run(dial: DialAction<JsonObject>, what: DialTrigger): Promise<void> {
    const s = this.settings(dial.id);
    switch (what) {
      case "reset":
        resetMinMax(dial.id);
        break;
      case "view":
        await this.save(dial, { view: nextView(s.view) });
        break;
      case "next":
        if (s.mode === "formula") return dial.showAlert();
        await this.save(dial, { index: rotateIndex(s, 1) });
        break;
      case "refresh":
        await poller.readNow();
        if (poller.snapshot.phase !== "live") await dial.showAlert();
        break;
      case "open-aida64":
        if (!openAida64(getGlobals().aidaPath)) await dial.showAlert();
        return;
      case "none":
        return;
    }
    await this.paint(dial, false);
  }

  private async describe(dial: DialAction<JsonObject>): Promise<void> {
    const t = triggerDescription(this.settings(dial.id));
    const key = JSON.stringify(t);
    if (this.triggers.get(dial.id) === key) return;
    this.triggers.set(dial.id, key);
    await dial.setTriggerDescription({ rotate: t.rotate, push: t.push || undefined, touch: t.touch || undefined, longTouch: t.longTouch || undefined });
  }

  private sensorAt(s: DialSettings, slot: number): Sensor | undefined {
    if (s.mode === "formula") return this.formulaSensor(s);
    return findSensor(poller.snapshot, s.sensors[slot] ?? "");
  }

  private formulaSensor(s: DialSettings): Sensor | undefined {
    const r = evaluateFormula(s, poller.snapshot);
    if (r.error) return undefined;
    return { key: "formula", id: "FORMULA", label: s.label || "Formula", raw: r.value === null ? "—" : String(r.value), type: "sys", numeric: r.value, unit: s.unit };
  }

  private async paint(dial: DialAction<JsonObject>, fresh: boolean): Promise<void> {
    const s = this.settings(dial.id);
    const app = resolveAppearance(s, getGlobals());
    const slot = currentSlot(s);
    const sensor = this.sensorAt(s, slot);
    const target = s.mode === "formula" ? (sensor ? "formula" : `Formula: ${evaluateFormula(s, poller.snapshot).error ?? ""}`) : (s.sensors[slot] ?? "");
    const g = effectiveGauge(s, slot, sensor);
    const span = g.max - g.min;
    const statsKey = s.mode === "formula" ? `formula:${s.expression}` : target;
    const rt = fresh ? sample(dial.id, statsKey, sensor?.numeric ?? null, g.smoothing, span) : peek(dial.id, span, statsKey, sensor?.numeric ?? null);
    if (fresh && g.alertLevel !== "off" && sensor) {
      rt.flash = alert(dial.id, { level: g.alertLevel, flash: g.alertFlash, sound: g.alertSound, confirm: 2, soundCooldownMs: 30_000 }, zoneOf(rt.value, g)).flashOn;
    }
    const v = gaugeView({ ...g, label: s.mode === "formula" ? s.label || "Formula" : g.label }, app, poller.snapshot, rt, sensor, target, { preview: previewValue(dial.id) });
    v.title = truncate(v.title || "", 18);
    if (v.style !== "status") {
      v.history = rt.history.slice(-s.windowSamples).map((x) => fraction(x, g.min, g.max) ?? 0);
      const off = s.offsets[sensor?.key ?? ""];
      if (s.rotateMode === "adjust" && off) v.title = truncate(v.title, 12) + ` (${off > 0 ? "+" : ""}${off})`;
    }
    const slots = s.mode === "formula" ? [] : s.sensors.filter(Boolean);
    const page = s.view === "sparkline" && s.rotateMode === "window" ? `${s.windowSamples} pts` : slots.length > 1 ? `${slots.indexOf(s.sensors[slot]!) + 1}/${slots.length}` : "";
    const second = s.view === "split" ? sideFor(splitTarget(s, slot), app, s) : undefined;
    const svg = renderStrip(v, s.view, page, second);
    await setImageIfChanged(dial.id, svg, (image) => dial.setFeedback({ canvas: image }));
  }
}

/** Recommended limits for a newly chosen primary sensor; keeps label/appearance choices. */
export function recommendedPatch(sensor: Sensor, s: DialSettings): Record<string, unknown> {
  const r = applyRecommendation(sensor, s);
  return { unit: r.unit, decimals: r.decimals, min: r.min, max: r.max, cold: r.cold, warn: r.warn, crit: r.crit, colorMode: r.colorMode };
}
