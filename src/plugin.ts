import streamDeck from "@elgato/streamdeck";
import { DialSensorAction } from "./actions/dial.js";
import { FormulaAction } from "./actions/formula.js";
import { GaugeAction } from "./actions/gauge.js";
import { MultiAction } from "./actions/multi.js";
import { CpuLoadAction, CpuTempAction, FanAction, GpuLoadAction, GpuTempAction, PowerAction, RamAction } from "./actions/presets.js";
import { afterPoll, loadGlobals, paintAll, poller, setGlobals } from "./hub.js";

for (const a of [new CpuTempAction(), new GpuTempAction(), new CpuLoadAction(), new GpuLoadAction(), new RamAction(), new FanAction(), new PowerAction(), new GaugeAction(), new MultiAction(), new FormulaAction(), new DialSensorAction()]) {
  streamDeck.actions.registerAction(a);
}

// One shared poller for every key. Keys repaint on each poll (images are only
// sent when they change). The inspector list is only refreshed when the set of
// sensors changes, never on every poll (that closed open dropdowns).
poller.subscribe(() => {
  void paintAll();
  void afterPoll();
});

streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
  setGlobals(ev.settings);
  void paintAll();
});

streamDeck.system.onSystemDidWakeUp(() => {
  streamDeck.logger.info("System woke — reconnecting the sensor backend");
  void poller.restart();
});

// Auto-recovery: read immediately when AIDA64 starts or stops (manifest ApplicationsToMonitor).
const onApp = (application: string, what: string) => {
  if (!application.toLowerCase().includes("aida64")) return;
  streamDeck.logger.info(`AIDA64 ${what}`);
  void poller.readNow();
};
streamDeck.system.onApplicationDidLaunch((ev) => onApp(ev.application, "launched"));
streamDeck.system.onApplicationDidTerminate((ev) => onApp(ev.application, "exited"));

streamDeck.logger.info("Sensorline starting");
streamDeck
  .connect()
  .then(loadGlobals)
  .then(paintAll)
  .catch((error: unknown) => {
    streamDeck.logger.error(`Sensorline failed to start: ${error instanceof Error ? error.message : String(error)}`);
  });
