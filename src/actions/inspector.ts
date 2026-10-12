import type { JsonObject, JsonValue } from "@elgato/utils";
import { type PropertyInspectorDidAppearEvent, type SendToPluginEvent, SingletonAction } from "@elgato/streamdeck";
import { pushSensorList, setInspectorVisible } from "../hub.js";

/** Shared inspector wiring: the sensor list is sent on appear and on getSensors only. */
export abstract class InspectorAction<T extends JsonObject = JsonObject> extends SingletonAction<T> {
  override async onPropertyInspectorDidAppear(_ev: PropertyInspectorDidAppearEvent<T>): Promise<void> {
    setInspectorVisible(true);
    await pushSensorList();
  }

  override async onPropertyInspectorDidDisappear(): Promise<void> {
    setInspectorVisible(false);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, T>): Promise<void> {
    const payload = ev.payload;
    if (payload && typeof payload === "object" && !Array.isArray(payload) && payload.event === "getSensors") {
      setInspectorVisible(true);
      await pushSensorList();
    }
  }
}
