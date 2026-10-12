import type { Snapshot } from "../sensors/types.js";

/**
 * A source of sensor readings. AIDA64 (Windows) is the primary backend.
 * Other backends exist so the plugin can be fed from elsewhere (a JSON file,
 * a script, or lm-sensors on Linux). None of them is AIDA64; AIDA64 Extreme
 * itself only runs on Windows.
 */
export interface SensorBackend {
  readonly id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  read(): Promise<Snapshot>;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
