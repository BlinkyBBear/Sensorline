import type { JsonObject } from "@elgato/utils";
import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { ensureStarted, getMulti, poller, registerPainter, release, setImageIfChanged, setMulti } from "../hub.js";
import { render } from "../render.js";
import { defaultMulti, parseMulti } from "../settings.js";
import { multiView } from "../view.js";
import { InspectorAction } from "./inspector.js";

export const MULTI_UUID = "com.rescuecraftstudio.sensorline.multi";

@action({ UUID: MULTI_UUID })
export class MultiAction extends InspectorAction {
  override async onWillAppear(ev: WillAppearEvent<JsonObject>): Promise<void> {
    setMulti(ev.action.id, parseMulti(ev.payload.settings));
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
    setMulti(ev.action.id, parseMulti(ev.payload.settings));
    if (ev.action.isKey()) await this.paint(ev.action);
  }

  override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
    await poller.readNow();
    await this.paint(ev.action);
    if (poller.snapshot.phase !== "live") await ev.action.showAlert();
  }

  private async paint(key: KeyAction<JsonObject>): Promise<void> {
    const view = multiView(getMulti(key.id) ?? defaultMulti(), poller.snapshot);
    await setImageIfChanged(key.id, render(view), (image) => key.setImage(image));
  }
}
