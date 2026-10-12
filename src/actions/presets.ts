import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { ensureStarted, forgetImage, poller, register, release, resetMinMax, setKeyInterval, startPreview } from "../hub.js";
import type { Sensor, Snapshot } from "../sensors/types.js";
import { type GaugeSettings, parseGauge } from "../settings.js";
import { migrateOnAppear, paintGauge, pressOpenAida, previewValues } from "./common.js";
import { InspectorAction } from "./inspector.js";

export type PresetKind = "cpu-load" | "ram" | "cpu-temp" | "gpu-temp" | "gpu-load" | "fan" | "power";

/**
 * One-click presets. Values follow docs/thresholds.md; every field can be
 * changed in the inspector. UUIDs of 1.0 actions are kept (cpu, memory,
 * temperature, gpu, fan, power); GPU temperature is new in 1.2.
 */
export const PRESETS: Record<PresetKind, JsonObject> = {
  "cpu-load": { label: "CPU", unit: "%", min: 0, max: 100, cold: 10, warn: 75, crit: 90, style: "radial" },
  ram: { label: "RAM", unit: "%", min: 0, max: 100, cold: 10, warn: 75, crit: 90, style: "radial" },
  "cpu-temp": { label: "CPU", unit: "°C", min: 20, max: 100, cold: 30, warn: 70, crit: 85, style: "radial" },
  "gpu-temp": { label: "GPU", unit: "°C", min: 20, max: 100, cold: 30, warn: 75, crit: 85, style: "radial" },
  "gpu-load": { label: "GPU", unit: "%", min: 0, max: 100, cold: 10, warn: 75, crit: 90, style: "radial" },
  fan: { label: "FAN", unit: "RPM", min: 0, max: 3000, cold: null, warn: null, crit: null, colorMode: "solid", style: "radial" },
  power: { label: "CPU W", unit: "W", min: 0, max: 250, cold: 15, warn: 125, crit: 200, style: "radial" },
};

/** Scores how well a sensor matches a preset; the best match is shown. */
export function score(kind: PresetKind, sensor: Sensor): number {
  const id = sensor.id.toUpperCase();
  const text = `${id} ${sensor.label.toUpperCase()}`;
  const usage = /UTI|USAGE|LOAD|%/.test(text) || sensor.unit === "%";
  const isTemp = sensor.type === "temp" || sensor.unit === "°C";
  switch (kind) {
    case "cpu-load":
      if (id === "SCPUUTI") return 1000;
      return /CPU|PROCESSOR/.test(text) ? (usage ? (/TOTAL|PACKAGE|AVERAGE/.test(text) ? 100 : 80) : 0) : 0;
    case "ram":
      if (id === "SMEMUTI") return 1000;
      return /MEM|RAM/.test(text) && usage && !/GPU|VIDEO/.test(text) ? 100 : 0;
    case "cpu-temp":
      if (!isTemp) return 0;
      if (id === "TCPU") return 1000;
      if (id === "TCPUPKG") return 900;
      return /CPU|PACKAGE|SOCKET|TCTL|TDIE/.test(text) && !/GPU/.test(text) ? 100 : 0;
    case "gpu-temp":
      if (!isTemp) return 0;
      if (id === "TGPU1") return 1000;
      return /GPU/.test(text) && !/HOT|MEM/.test(text) ? 100 : /GPU/.test(text) ? 20 : 0;
    case "gpu-load":
      if (id === "SGPU1UTI") return 1000;
      return /GPU|GRAPHICS/.test(text) && usage ? 100 : 0;
    case "fan":
      if (sensor.type !== "fan" && sensor.unit !== "RPM") return 0;
      if (id === "FCPU") return 1000;
      return /CPU/.test(text) ? 100 : /PUMP/.test(text) ? 10 : 70;
    case "power":
      if (sensor.type !== "pwr" && sensor.unit !== "W") return 0;
      if (id === "PCPUPKG") return 1000;
      return /CPU|PACKAGE/.test(text) ? 100 : 50;
  }
}

export function bestMatch(kind: PresetKind, snapshot: Snapshot): Sensor | undefined {
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

/** Preset settings: preset values under the user's stored overrides. */
export function presetSettings(kind: PresetKind, raw: JsonObject | undefined): GaugeSettings {
  const clean: JsonObject = {};
  // Empty fields in the inspector mean "use the preset".
  for (const [k, v] of Object.entries(raw ?? {})) if (v !== "" && v !== undefined) clean[k] = v;
  return parseGauge({ ...PRESETS[kind], ...clean });
}

abstract class PresetAction extends InspectorAction {
  private raw = new Map<string, JsonObject>();
  constructor(private readonly kind: PresetKind) {
    super();
  }

  private settings(id: string): GaugeSettings {
    const s = presetSettings(this.kind, this.raw.get(id));
    if (!s.sensorId) s.sensorKey = bestMatch(this.kind, poller.snapshot)?.key ?? "";
    return s;
  }

  override async onWillAppear(ev: WillAppearEvent<JsonObject>): Promise<void> {
    if (!ev.action.isKey()) return;
    const key = ev.action;
    this.raw.set(key.id, await migrateOnAppear(key, ev.payload.settings));
    register(key.id, (fresh) => this.paint(key, fresh), this.settings(key.id).intervalMs);
    await key.setTitle("");
    await ensureStarted();
    await this.paint(key, false);
  }

  override async onWillDisappear(ev: WillDisappearEvent<JsonObject>): Promise<void> {
    this.raw.delete(ev.action.id);
    await release(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): Promise<void> {
    this.raw.set(ev.action.id, ev.payload.settings);
    setKeyInterval(ev.action.id, this.settings(ev.action.id).intervalMs);
    forgetImage(ev.action.id);
    if (ev.action.isKey()) await this.paint(ev.action, false);
  }

  override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
    const s = this.settings(ev.action.id);
    if (s.pressAction === "reset") {
      resetMinMax(ev.action.id);
      await ev.action.showOk();
    } else if (s.pressAction === "open-aida64") {
      await pressOpenAida(ev.action);
    } else {
      await poller.readNow();
      if (poller.snapshot.phase !== "live") await ev.action.showAlert();
    }
    await this.paint(ev.action, false);
  }

  protected override async onInspectorMessage(id: string, event: string): Promise<void> {
    if (event === "preview") startPreview(id, previewValues(this.settings(id)));
  }

  private async paint(key: KeyAction<JsonObject>, fresh: boolean): Promise<void> {
    const s = this.settings(key.id);
    const target = s.sensorId || s.sensorKey;
    const sensor = poller.snapshot.sensors.find((x) => x.key === target || x.id === target);
    await paintGauge(key, s, sensor, target, fresh);
  }
}

@action({ UUID: "com.rescuecraftstudio.sensorline.cpu" })
export class CpuLoadAction extends PresetAction {
  constructor() { super("cpu-load"); }
}
@action({ UUID: "com.rescuecraftstudio.sensorline.memory" })
export class RamAction extends PresetAction {
  constructor() { super("ram"); }
}
@action({ UUID: "com.rescuecraftstudio.sensorline.temperature" })
export class CpuTempAction extends PresetAction {
  constructor() { super("cpu-temp"); }
}
@action({ UUID: "com.rescuecraftstudio.sensorline.gpu-temperature" })
export class GpuTempAction extends PresetAction {
  constructor() { super("gpu-temp"); }
}
@action({ UUID: "com.rescuecraftstudio.sensorline.gpu" })
export class GpuLoadAction extends PresetAction {
  constructor() { super("gpu-load"); }
}
@action({ UUID: "com.rescuecraftstudio.sensorline.fan" })
export class FanAction extends PresetAction {
  constructor() { super("fan"); }
}
@action({ UUID: "com.rescuecraftstudio.sensorline.power" })
export class PowerAction extends PresetAction {
  constructor() { super("power"); }
}
