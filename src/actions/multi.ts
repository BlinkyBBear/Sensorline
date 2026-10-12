import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { ensureStarted, forgetImage, getGlobals, poller, register, release, setImageIfChanged, setKeyInterval } from "../hub.js";
import { render } from "../render.js";
import { type MultiSettings, parseMulti, resolveAppearance } from "../settings.js";
import { multiView } from "../view.js";
import { migrateOnAppear, pressOpenAida } from "./common.js";
import { InspectorAction } from "./inspector.js";

export const MULTI_UUID = "com.rescuecraftstudio.sensorline.multi";

@action({ UUID: MULTI_UUID })
export class MultiAction extends InspectorAction {
  private settings = new Map<string, MultiSettings>();

  override async onWillAppear(ev: WillAppearEvent<JsonObject>): Promise<void> {
    if (!ev.action.isKey()) return;
    const key = ev.action;
    const s = parseMulti(await migrateOnAppear(key, ev.payload.settings));
    this.settings.set(key.id, s);
    register(key.id, () => this.paint(key), s.intervalMs);
    await key.setTitle("");
    await ensureStarted();
    await this.paint(key);
  }

  override async onWillDisappear(ev: WillDisappearEvent<JsonObject>): Promise<void> {
    this.settings.delete(ev.action.id);
    await release(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): Promise<void> {
    const s = parseMulti(ev.payload.settings);
    this.settings.set(ev.action.id, s);
    setKeyInterval(ev.action.id, s.intervalMs);
    forgetImage(ev.action.id);
    if (ev.action.isKey()) await this.paint(ev.action);
  }

  override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
    if (this.settings.get(ev.action.id)?.pressAction === "open-aida64") return pressOpenAida(ev.action);
    await poller.readNow();
    await this.paint(ev.action);
    if (poller.snapshot.phase !== "live") await ev.action.showAlert();
  }

  private async paint(key: KeyAction<JsonObject>): Promise<void> {
    const s = this.settings.get(key.id);
    if (!s) return;
    const view = multiView(s, resolveAppearance(s, getGlobals()), poller.snapshot);
    await setImageIfChanged(key.id, render(view), (image) => key.setImage(image));
  }
}
