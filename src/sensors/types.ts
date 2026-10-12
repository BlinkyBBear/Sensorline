export type SensorType = "temp" | "fan" | "volt" | "curr" | "pwr" | "duty" | "sys" | "other";
export const SENSOR_TYPES: ReadonlySet<string> = new Set<SensorType>(["temp", "fan", "volt", "curr", "pwr", "duty", "sys", "other"]);

export type GaugeStyle = "radial" | "bar" | "value" | "sparkline";

/** Optional per-sensor hints a backend can supply (e.g. lm-sensors _max/_crit). */
export interface SensorHint {
  min?: number;
  max?: number;
  cold?: number | null;
  warn?: number | null;
  crit?: number | null;
  unit?: string;
  decimals?: number;
  style?: GaugeStyle;
}

export interface Sensor {
  /** Unique key: the AIDA64 id, suffixed with #2, #3… for duplicates. */
  key: string;
  id: string;
  label: string;
  raw: string;
  type: SensorType;
  numeric: number | null;
  unit: string;
  hint?: SensorHint;
}

export type Phase = "live" | "not-running" | "sharing-off" | "backend-missing" | "error";

export interface Snapshot {
  phase: Phase;
  source: string;
  detail: string;
  sensors: Sensor[];
}

export function emptySnapshot(phase: Phase, source: string, detail: string): Snapshot {
  return { phase, source, detail, sensors: [] };
}
