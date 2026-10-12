import type { JsonObject } from "@elgato/utils";
import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { ensureStarted, getGauge, history, poller, registerPainter, release, setGauge, setHistory, setImageIfChanged } from "../hub.js";
import { render } from "../render.js";
import { applyRecommendation, defaultGauge, parseGauge } from "../settings.js";
import { fraction, gaugeView, pushHistory } from "../view.js";
import { InspectorAction } from "./inspector.js";

export const GAUGE_UUID = "com.rescuecraftstudio.sensorline.gauge";

@action({ UUID: GAUGE_UUID })
export class GaugeAction extends InspectorAction {
  override async onWillAppear(ev: WillAppearEvent<JsonObject>): Promise<void> {
    setGauge(ev.action.id, parseGauge(ev.payload.settings));
    if (!ev.action.isKey()) return;
    const key = ev.action;
    registerPainter(key.id, () => this.paint(key));
    await key.setTitle("");
    await ensureStarted();
    await this.paint(key);
  }

  override async onWillDisappear(ev: WillDisappearEvent<JsonObject>): Promise<void> {
    await release(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): Promise<void> {
    const previous = getGauge(ev.action.id) ?? defaultGauge();
    let next = parseGauge(ev.payload.settings);
    if (next.sensorKey && next.sensorKey !== previous.sensorKey) {
      const sensor = poller.snapshot.sensors.find((s) => s.key === next.sensorKey);
      if (sensor) {
        next = applyRecommendation(sensor, next);
        await ev.action.setSettings(next as unknown as JsonObject);
      }
    }
    setGauge(ev.action.id, next);
    if (ev.action.isKey()) await this.paint(ev.action);
  }

  override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
    await poller.readNow();
    await this.paint(ev.action);
    if (poller.snapshot.phase !== "live") await ev.action.showAlert();
  }

  private async paint(key: KeyAction<JsonObject>): Promise<void> {
    const settings = getGauge(key.id) ?? defaultGauge();
    const sensor = poller.snapshot.sensors.find((s) => s.key === settings.sensorKey);
    if (settings.style === "sparkline" && sensor) setHistory(key.id, pushHistory(history(key.id), fraction(sensor.numeric, settings.min, settings.max)));
    const view = gaugeView(settings, poller.snapshot, history(key.id));
    await setImageIfChanged(key.id, render(view), (image) => key.setImage(image));
  }
}
