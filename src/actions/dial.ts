import { action, type DialAction, type DialDownEvent, type DialRotateEvent, type DidReceiveSettingsEvent, type TouchTapEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { zoneOf } from "../colour.js";
import { ensureStarted, getGlobals, peek, poller, register, release, resetMinMax, sample, setKeyInterval } from "../hub.js";
import { renderStrip } from "../render.js";
import { recommend } from "../sensors/thresholds.js";
import { type DialSettings, type DialView, parseDial, resolveAppearance } from "../settings.js";
import { backgroundColour, arcColour, findSensor, fraction, gaugeView, statusView, truncate } from "../view.js";
import { migrateOnAppear } from "./common.js";
import { InspectorAction } from "./inspector.js";

export const DIAL_UUID = "com.rescuecraftstudio.sensorline.dial";
const VIEWS: DialView[] = ["bar", "value", "sparkline"];

/** Indices of configured sensors. */
export function activeSlots(s: DialSettings): number[] {
  return s.sensors.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
}

/** Next configured slot when rotating by `ticks`. */
export function rotateIndex(s: DialSettings, ticks: number): number {
  const slots = activeSlots(s);
  if (slots.length === 0) return 0;
  const at = Math.max(0, slots.indexOf(s.index));
  const next = (((at + Math.sign(ticks)) % slots.length) + slots.length) % slots.length;
  return slots[next]!;
}

/**
 * Stream Deck + dial: shows a sensor on the touch strip (custom layout with one
 * full-size pixmap). Rotate: cycle sensors or adjust High/Critical. Press:
 * reset min/max. Tap the strip: switch view.
 */
@action({ UUID: DIAL_UUID })
export class DialSensorAction extends InspectorAction {
  private raw = new Map<string, JsonObject>();

  private settings(id: string): DialSettings {
    return parseDial(this.raw.get(id));
  }

  private async save(dial: DialAction<JsonObject>, patch: JsonObject): Promise<void> {
    const next = { ...(this.raw.get(dial.id) ?? {}), ...patch };
    this.raw.set(dial.id, next);
    await dial.setSettings(next);
  }

  override async onWillAppear(ev: WillAppearEvent<JsonObject>): Promise<void> {
    if (!ev.action.isDial()) return;
    const dial = ev.action;
    this.raw.set(dial.id, await migrateOnAppear(dial, ev.payload.settings));
    register(dial.id, (fresh) => this.paint(dial, fresh), this.settings(dial.id).intervalMs);
    await dial.setFeedbackLayout("layouts/strip.json");
    await dial.setTriggerDescription({ rotate: "Next sensor / adjust", push: "Reset min/max", touch: "Switch view" });
    await ensureStarted();
    await this.paint(dial, false);
  }

  override async onWillDisappear(ev: WillDisappearEvent<JsonObject>): Promise<void> {
    this.raw.delete(ev.action.id);
    await release(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): Promise<void> {
    this.raw.set(ev.action.id, ev.payload.settings);
    setKeyInterval(ev.action.id, this.settings(ev.action.id).intervalMs);
    if (ev.action.isDial()) await this.paint(ev.action, false);
  }

  override async onDialRotate(ev: DialRotateEvent<JsonObject>): Promise<void> {
    const s = this.settings(ev.action.id);
    if (s.rotateMode === "adjust") {
      const key = s.sensors[s.index] ?? "";
      if (!key) return ev.action.showAlert();
      const offsets = { ...s.offsets, [key]: Math.round(((s.offsets[key] ?? 0) + ev.payload.ticks * s.adjustStep) * 100) / 100 };
      await this.save(ev.action, { offsets });
    } else {
      await this.save(ev.action, { index: rotateIndex(s, ev.payload.ticks) });
    }
    await this.paint(ev.action, false);
  }

  override async onDialDown(ev: DialDownEvent<JsonObject>): Promise<void> {
    resetMinMax(ev.action.id);
    await this.paint(ev.action, false);
  }

  override async onTouchTap(ev: TouchTapEvent<JsonObject>): Promise<void> {
    const s = this.settings(ev.action.id);
    const view = VIEWS[(VIEWS.indexOf(s.view) + 1) % VIEWS.length]!;
    await this.save(ev.action, { view });
    await this.paint(ev.action, false);
  }

  private async paint(dial: DialAction<JsonObject>, fresh: boolean): Promise<void> {
    const s = this.settings(dial.id);
    const app = resolveAppearance(s, getGlobals());
    const status = statusView(poller.snapshot, app);
    const key = s.sensors[s.index] || s.sensors.find(Boolean) || "";
    const sensor = findSensor(poller.snapshot, key);
    let svg: string;
    if (status) {
      svg = renderStrip(status, s.view, "");
    } else if (!sensor) {
      svg = renderStrip({ ...statusView({ ...poller.snapshot, phase: "error", detail: "" }, app)!, title: key ? "Missing" : "Choose sensor", steps: [key ? truncate(key, 18) : "Open the inspector"] }, s.view, "");
    } else {
      const rec = recommend(sensor);
      const off = s.offsets[sensor.key] ?? 0;
      const zones = { min: rec.min, max: rec.max, cold: rec.cold, warn: rec.warn === null ? null : rec.warn + off, crit: rec.crit === null ? null : rec.crit + off };
      const rt = fresh ? sample(dial.id, sensor.key, sensor.numeric, s.smoothing, rec.max - rec.min) : peek(dial.id, rec.max - rec.min, sensor.key, sensor.numeric);
      const gauge = {
        ...defaultsFor(s), sensorKey: sensor.key, style: "bar" as const, unit: rec.unit, decimals: s.decimals || rec.decimals,
        min: rec.min, max: rec.max, cold: zones.cold, warn: zones.warn, crit: zones.crit,
        colorMode: (zones.warn === null && zones.crit === null ? "solid" : "threshold") as "solid" | "threshold",
        background: s.background, holdMinMax: true,
      };
      const v = gaugeView(gauge, app, poller.snapshot, rt, sensor, sensor.key);
      v.history = rt.history.map((x) => fraction(x, rec.min, rec.max) ?? 0);
      v.zone = zoneOf(rt.value, zones);
      v.color = arcColour(rt.value, zones, app, gauge.colorMode, "#d7dbe3");
      v.background = backgroundColour(rt.value, zones, app, s.background);
      v.title = truncate(sensor.label, 16) + (s.rotateMode === "adjust" && off ? ` (${off > 0 ? "+" : ""}${off})` : "");
      const slots = activeSlots(s);
      const page = slots.length > 1 ? `${slots.indexOf(s.index) + 1}/${slots.length}` : "";
      svg = renderStrip(v, s.view, page);
    }
    await dial.setFeedback({ canvas: `data:image/svg+xml,${encodeURIComponent(svg)}` });
  }
}

function defaultsFor(s: DialSettings) {
  return {
    schema: s.schema, sensorId: "", label: "", showLabel: true, solid: "#d7dbe3", intervalMs: s.intervalMs, smoothing: s.smoothing,
    pressAction: "refresh" as const, alertLevel: "off" as const, alertFlash: false, alertSound: false,
    palette: s.palette, gradient: s.gradient, theme: s.theme, textSize: s.textSize, colCold: s.colCold, colNormal: s.colNormal, colHigh: s.colHigh, colCrit: s.colCrit, showZoneGlyph: s.showZoneGlyph, showTrend: s.showTrend,
  };
}
