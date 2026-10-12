import streamDeck from "@elgato/streamdeck";
import { GaugeAction } from "./actions/gauge.js";
import { CpuAction, FanAction, GpuAction, MemoryAction, PowerAction, TemperatureAction } from "./actions/monitors.js";
import { MultiAction } from "./actions/multi.js";
import { paintAll, poller, pushIfListChanged } from "./hub.js";

streamDeck.actions.registerAction(new CpuAction());
streamDeck.actions.registerAction(new MemoryAction());
streamDeck.actions.registerAction(new TemperatureAction());
streamDeck.actions.registerAction(new FanAction());
streamDeck.actions.registerAction(new GpuAction());
streamDeck.actions.registerAction(new PowerAction());
streamDeck.actions.registerAction(new GaugeAction());
streamDeck.actions.registerAction(new MultiAction());

// Repaint keys on every poll. The inspector list is only refreshed when the
// set of sensors changes, never on every poll (that closed open dropdowns).
poller.subscribe(() => {
  void paintAll();
  void pushIfListChanged();
});

streamDeck.system.onSystemDidWakeUp(() => {
  streamDeck.logger.info("System woke — reconnecting the sensor backend");
  void poller.restart();
});

const onApp = (application: string, what: string) => {
  if (!application.toLowerCase().includes("aida64")) return;
  streamDeck.logger.info(`AIDA64 ${what}`);
  void poller.readNow();
};
streamDeck.system.onApplicationDidLaunch((ev) => onApp(ev.application, "launched"));
streamDeck.system.onApplicationDidTerminate((ev) => onApp(ev.application, "exited"));

streamDeck.logger.info("Sensorline starting");
streamDeck.connect().catch((error: unknown) => {
  streamDeck.logger.error(`Sensorline failed to start: ${error instanceof Error ? error.message : String(error)}`);
});
