import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { compute, VARIABLES } from "../formula.js";
import { ensureStarted, forgetImage, poller, pushStatus, register, release, resetMinMax, setKeyInterval, startPreview } from "../hub.js";
import type { Sensor, Snapshot } from "../sensors/types.js";
import { type FormulaSettings, formatNumber, parseFormula } from "../settings.js";
import { findSensor } from "../view.js";
import { migrateOnAppear, paintGauge, pressOpenAida, previewValues } from "./common.js";
import { InspectorAction } from "./inspector.js";

export const FORMULA_UUID = "com.rescuecraftstudio.sensorline.formula";

/** Evaluates a formula against the snapshot. Inputs a…h map to the chosen sensors. */
export function evaluateFormula(s: FormulaSettings, snapshot: Snapshot): { value: number | null; error: string | null } {
  const vars: Record<string, number | null> = {};
  s.inputs.forEach((key, i) => {
    vars[VARIABLES[i]!] = key ? (findSensor(snapshot, key)?.numeric ?? null) : null;
  });
  return compute(s.expression, vars);
}

@action({ UUID: FORMULA_UUID })
export class FormulaAction extends InspectorAction {
  private settings = new Map<string, FormulaSettings>();

  override async onWillAppear(ev: WillAppearEvent<JsonObject>): Promise<void> {
    if (!ev.action.isKey()) return;
    const key = ev.action;
    const s = parseFormula(await migrateOnAppear(key, ev.payload.settings));
    this.settings.set(key.id, s);
    register(key.id, (fresh) => this.paint(key, fresh), s.intervalMs);
    await key.setTitle("");
    await ensureStarted();
    await this.paint(key, false);
  }

  override async onWillDisappear(ev: WillDisappearEvent<JsonObject>): Promise<void> {
    this.settings.delete(ev.action.id);
    await release(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): Promise<void> {
    const s = parseFormula(ev.payload.settings);
    this.settings.set(ev.action.id, s);
    setKeyInterval(ev.action.id, s.intervalMs);
    forgetImage(ev.action.id);
    if (ev.action.isKey()) await this.paint(ev.action, false);
    await this.pushExtraStatus(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
    const s = this.settings.get(ev.action.id);
    if (s?.pressAction === "reset") {
      resetMinMax(ev.action.id);
      await ev.action.showOk();
    } else if (s?.pressAction === "open-aida64") {
      await pressOpenAida(ev.action);
    } else {
      await poller.readNow();
      if (poller.snapshot.phase !== "live") await ev.action.showAlert();
    }
    await this.paint(ev.action, false);
  }

  protected override async pushExtraStatus(id: string): Promise<void> {
    const s = this.settings.get(id);
    if (!s) return pushStatus();
    const r = evaluateFormula(s, poller.snapshot);
    await pushStatus(r.error ? { validation: r.error } : { formula: r.value === null ? "Waiting for inputs" : `= ${formatNumber(r.value, s.decimals)}` });
  }

  protected override async onInspectorMessage(id: string, event: string): Promise<void> {
    const s = this.settings.get(id);
    if (event === "preview" && s) startPreview(id, previewValues(s));
  }

  private async paint(key: KeyAction<JsonObject>, fresh: boolean): Promise<void> {
    const s = this.settings.get(key.id);
    if (!s) return;
    const r = evaluateFormula(s, poller.snapshot);
    const sensor: Sensor | undefined = r.error
      ? undefined
      : { key: "formula", id: "FORMULA", label: s.label || "Formula", raw: r.value === null ? "—" : String(r.value), type: "sys", numeric: r.value, unit: s.unit };
    await paintGauge(key, { ...s, label: s.label || "Formula" }, sensor, r.error ? `Formula: ${r.error}` : "formula", fresh);
  }
}
