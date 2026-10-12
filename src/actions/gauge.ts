import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { ensureStarted, forgetImage, poller, pushStatus, register, release, resetMinMax, setKeyInterval, startPreview } from "../hub.js";
import { applyRecommendation, type GaugeSettings, gaugeTarget, parseGauge } from "../settings.js";
import { migrateOnAppear, nextSensorOfType, paintGauge, pressOpenAida, previewValues, sensorFor } from "./common.js";
import { InspectorAction } from "./inspector.js";

export const GAUGE_UUID = "com.rescuecraftstudio.sensorline.gauge";

@action({ UUID: GAUGE_UUID })
export class GaugeAction extends InspectorAction {
  private settings = new Map<string, GaugeSettings>();
  private keyActions = new Map<string, KeyAction<JsonObject>>();

  override async onWillAppear(ev: WillAppearEvent<JsonObject>): Promise<void> {
    if (!ev.action.isKey()) return;
    const key = ev.action;
    const raw = await migrateOnAppear(key, ev.payload.settings);
    const s = parseGauge(raw);
    this.settings.set(key.id, s);
    this.keyActions.set(key.id, key);
    register(key.id, (fresh) => this.paint(key, fresh), s.intervalMs);
    await key.setTitle("");
    await ensureStarted();
    await this.paint(key, false);
  }

  override async onWillDisappear(ev: WillDisappearEvent<JsonObject>): Promise<void> {
    this.settings.delete(ev.action.id);
    this.keyActions.delete(ev.action.id);
    await release(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): Promise<void> {
    const previous = this.settings.get(ev.action.id);
    let next = parseGauge(ev.payload.settings);
    const target = gaugeTarget(next);
    if (target && previous && target !== gaugeTarget(previous)) {
      const sensor = sensorFor(target);
      if (sensor) {
        next = { ...applyRecommendation(sensor, next), sensorKey: next.sensorId ? next.sensorKey : sensor.key };
        await ev.action.setSettings({ ...ev.payload.settings, ...next } as unknown as JsonObject);
      }
    }
    this.settings.set(ev.action.id, next);
    setKeyInterval(ev.action.id, next.intervalMs);
    forgetImage(ev.action.id);
    if (ev.action.isKey()) await this.paint(ev.action, false);
    await this.pushExtraStatus(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
    const s = this.settings.get(ev.action.id) ?? parseGauge(ev.payload.settings);
    switch (s.pressAction) {
      case "reset":
        resetMinMax(ev.action.id);
        await this.paint(ev.action, false);
        await ev.action.showOk();
        return;
      case "open-aida64":
        await pressOpenAida(ev.action);
        return;
      case "cycle": {
        const next = nextSensorOfType(gaugeTarget(s));
        if (!next) {
          await ev.action.showAlert();
          return;
        }
        const updated = { ...applyRecommendation(next, s), sensorId: "" };
        this.settings.set(ev.action.id, updated);
        await ev.action.setSettings({ ...ev.payload.settings, ...updated } as unknown as JsonObject);
        await this.paint(ev.action, true);
        return;
      }
      default:
        await poller.readNow();
        await this.paint(ev.action, false);
        if (poller.snapshot.phase !== "live") await ev.action.showAlert();
    }
  }

  protected override async pushExtraStatus(id: string): Promise<void> {
    const s = this.settings.get(id);
    const target = s ? gaugeTarget(s) : "";
    const found = target ? Boolean(sensorFor(target)) : true;
    await pushStatus(found || poller.snapshot.phase !== "live" ? {} : { validation: `Sensor "${target}" was not found in AIDA64.` });
  }

  protected override async onInspectorMessage(id: string, event: string): Promise<void> {
    if (event === "preview") {
      const s = this.settings.get(id);
      if (s) startPreview(id, previewValues(s));
    }
  }

  private async paint(key: KeyAction<JsonObject>, fresh: boolean): Promise<void> {
    const s = this.settings.get(key.id);
    if (!s) return;
    const target = gaugeTarget(s);
    await paintGauge(key, s, sensorFor(target), target, fresh);
  }
}
