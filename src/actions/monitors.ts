import type { JsonObject } from "@elgato/utils";
import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { ensureStarted, getGauge, history, poller, registerPainter, release, setGauge, setHistory, setImageIfChanged } from "../hub.js";
import { render } from "../render.js";
import type { Sensor, Snapshot } from "../sensors/types.js";
import { type GaugeSettings, parseGauge } from "../settings.js";
import { fraction, gaugeView, pushHistory } from "../view.js";

export type MonitorKind = "cpu" | "memory" | "temperature" | "fan" | "gpu" | "power";

/** Fixed presets for the one-click monitor keys. */
export const PRESETS: Record<MonitorKind, JsonObject> = {
  cpu: { label: "CPU", min: 0, max: 100, cold: 10, warn: 75, crit: 90, style: "radial" },
  memory: { label: "RAM", min: 0, max: 100, cold: 10, warn: 75, crit: 90, style: "radial" },
  temperature: { label: "TEMP", min: 20, max: 100, cold: 30, warn: 70, crit: 85, style: "radial" },
  fan: { label: "FAN", min: 0, max: 3000, cold: 400, warn: 2000, crit: 2600, style: "radial" },
  gpu: { label: "GPU", min: 0, max: 100, cold: 10, warn: 75, crit: 90, style: "radial" },
  power: { label: "PWR", min: 0, max: 300, cold: 40, warn: 180, crit: 250, style: "radial" },
};

/** Scores how well a sensor matches a monitor kind; the best match is shown. */
export function score(kind: MonitorKind, sensor: Sensor): number {
  const text = `${sensor.id.toUpperCase()} ${sensor.label.toUpperCase()}`;
  const usage = /UTIL|USAGE|LOAD|%/.test(text) || sensor.unit === "%";
  switch (kind) {
    case "cpu":
      return /CPU|PROCESSOR/.test(text) ? (usage ? (/TOTAL|PACKAGE|AVERAGE/.test(text) ? 100 : 80) : 10) : 0;
    case "memory":
      return /MEM|RAM/.test(text) ? (usage ? 100 : 40) : 0;
    case "temperature":
      if (sensor.type !== "temp" && !/TEMP|°C|C$/.test(text)) return 0;
      return /CPU|PACKAGE|SOCKET/.test(text) ? 100 : /GPU/.test(text) ? 60 : 40;
    case "fan":
      if (sensor.type !== "fan" && !/FAN|RPM/.test(text)) return 0;
      return /CPU/.test(text) ? 100 : 70;
    case "gpu":
      return /GPU|GRAPHICS/.test(text) ? (usage ? 100 : 50) : 0;
    case "power":
      if (sensor.type !== "pwr" && !/POWER|WATT|\bW\b/.test(text)) return 0;
      return /CPU|PACKAGE/.test(text) ? 100 : 70;
  }
}

export function bestMatch(kind: MonitorKind, snapshot: Snapshot): Sensor | undefined {
  let best: Sensor | undefined;
  let top = 0;
  for (const sensor of snapshot.sensors) {
    const s = score(kind, sensor);
    if (s > top) {
      best = sensor;
      top = s;
    }
  }
  return best;
}

abstract class MonitorAction extends SingletonAction {
  constructor(private readonly kind: MonitorKind) {
    super();
  }

  private settingsFor(raw: unknown): GaugeSettings {
    const settings = parseGauge({ ...PRESETS[this.kind], ...(raw && typeof raw === "object" ? raw : {}) });
    const match = bestMatch(this.kind, poller.snapshot);
    if (match) settings.sensorKey = match.key;
    return settings;
  }

  override async onWillAppear(ev: WillAppearEvent<JsonObject>): Promise<void> {
    setGauge(ev.action.id, this.settingsFor(ev.payload.settings));
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
    setGauge(ev.action.id, this.settingsFor(ev.payload.settings));
    if (ev.action.isKey()) await this.paint(ev.action);
  }

  override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
    await poller.readNow();
    await this.paint(ev.action);
    if (poller.snapshot.phase !== "live") await ev.action.showAlert();
  }

  private async paint(key: KeyAction<JsonObject>): Promise<void> {
    const settings = this.settingsFor(getGauge(key.id));
    const match = bestMatch(this.kind, poller.snapshot);
    if (settings.style === "sparkline" && match) setHistory(key.id, pushHistory(history(key.id), fraction(match.numeric, settings.min, settings.max)));
    const view = gaugeView({ ...settings, sensorKey: match?.key || settings.sensorKey }, poller.snapshot, history(key.id));
    await setImageIfChanged(key.id, render(view), (image) => key.setImage(image));
  }
}

@action({ UUID: "com.rescuecraftstudio.sensorline.cpu" })
export class CpuAction extends MonitorAction {
  constructor() { super("cpu"); }
}
@action({ UUID: "com.rescuecraftstudio.sensorline.memory" })
export class MemoryAction extends MonitorAction {
  constructor() { super("memory"); }
}
@action({ UUID: "com.rescuecraftstudio.sensorline.temperature" })
export class TemperatureAction extends MonitorAction {
  constructor() { super("temperature"); }
}
@action({ UUID: "com.rescuecraftstudio.sensorline.fan" })
export class FanAction extends MonitorAction {
  constructor() { super("fan"); }
}
@action({ UUID: "com.rescuecraftstudio.sensorline.gpu" })
export class GpuAction extends MonitorAction {
  constructor() { super("gpu"); }
}
@action({ UUID: "com.rescuecraftstudio.sensorline.power" })
export class PowerAction extends MonitorAction {
  constructor() { super("power"); }
}
