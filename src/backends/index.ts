import { Aida64Backend } from "./aida64.js";
import type { SensorBackend } from "./backend.js";
import { FileBackend, LmSensorsBackend, NoBackend, ScriptBackend } from "./simple.js";

export type { SensorBackend } from "./backend.js";

/**
 * Chooses a backend. Overrides first (SENSORLINE_SCRIPT, SENSORLINE_FILE), then
 * AIDA64 on Windows. On Linux a generic lm-sensors backend is used; it is not
 * AIDA64. Add new platform backends here.
 */
export function selectBackend(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): SensorBackend {
  if (env.SENSORLINE_SCRIPT) return new ScriptBackend(env.SENSORLINE_SCRIPT);
  if (env.SENSORLINE_FILE) return new FileBackend(env.SENSORLINE_FILE);
  if (platform === "win32") return new Aida64Backend();
  if (platform === "linux") return new LmSensorsBackend();
  return new NoBackend("AIDA64 Extreme is Windows-only. On macOS set SENSORLINE_FILE or SENSORLINE_SCRIPT to a sensor feed.");
}
