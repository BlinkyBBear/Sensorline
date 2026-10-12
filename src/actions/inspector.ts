import { type PropertyInspectorDidAppearEvent, type SendToPluginEvent, SingletonAction } from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { pushSensorList, pushStatus, setInspectorVisible } from "../hub.js";

/** Shared inspector wiring: the sensor list is sent on appear and on getSensors only. */
export abstract class InspectorAction<T extends JsonObject = JsonObject> extends SingletonAction<T> {
  override async onPropertyInspectorDidAppear(_ev: PropertyInspectorDidAppearEvent<T>): Promise<void> {
    setInspectorVisible(true);
    await pushSensorList();
    await this.pushExtraStatus(_ev.action.id);
  }

  override async onPropertyInspectorDidDisappear(): Promise<void> {
    setInspectorVisible(false);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, T>): Promise<void> {
    const payload = ev.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    if (payload.event === "getSensors") {
      setInspectorVisible(true);
      await pushSensorList();
      await this.pushExtraStatus(ev.action.id);
      return;
    }
    await this.onInspectorMessage(ev.action.id, String(payload.event ?? ""), payload);
  }

  /** Action-specific status (e.g. formula result or "ID not found"). */
  protected async pushExtraStatus(_id: string): Promise<void> {
    await pushStatus();
  }

  protected async onInspectorMessage(_id: string, _event: string, _payload: JsonObject): Promise<void> {}
}
