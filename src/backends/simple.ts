import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseFeed } from "../sensors/parse.js";
import { emptySnapshot, type Snapshot } from "../sensors/types.js";
import { errorMessage, type SensorBackend } from "./backend.js";

function run(command: string, args: string[], timeout = 2500): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, windowsHide: true, maxBuffer: 2_000_000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout));
    });
  });
}

function fromText(source: string, text: string, emptyDetail: string): Snapshot {
  const sensors = parseFeed(text);
  if (sensors.length === 0) return emptySnapshot("error", source, emptyDetail);
  return { phase: "live", source, detail: `${sensors.length} sensors via ${source}.`, sensors };
}

/** Reads a file containing AIDA64-style XML or JSON (SENSORLINE_FILE). */
export class FileBackend implements SensorBackend {
  readonly id = "file";
  constructor(private readonly file: string) {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async read(): Promise<Snapshot> {
    try {
      return fromText("file", await readFile(this.file, "utf8"), `No sensors in ${this.file}.`);
    } catch (error) {
      return emptySnapshot("error", "file", errorMessage(error));
    }
  }
}

/** Runs a command that prints AIDA64-style XML or JSON (SENSORLINE_SCRIPT). */
export class ScriptBackend implements SensorBackend {
  readonly id = "script";
  constructor(private readonly command: string) {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async read(): Promise<Snapshot> {
    try {
      return fromText("script", await run(this.command, []), "The script printed no sensors.");
    } catch (error) {
      return emptySnapshot("error", "script", errorMessage(error));
    }
  }
}

/** Generic Linux backend using `sensors -j`. This is lm-sensors, not AIDA64. */
export class LmSensorsBackend implements SensorBackend {
  readonly id = "lm-sensors";
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async read(): Promise<Snapshot> {
    try {
      return fromText("lm-sensors", await run("sensors", ["-j"]), "lm-sensors returned no readings.");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
      if (code === "ENOENT") {
        return emptySnapshot("backend-missing", "lm-sensors", "lm-sensors is not installed. Install it, or set SENSORLINE_FILE / SENSORLINE_SCRIPT.");
      }
      return emptySnapshot("error", "lm-sensors", errorMessage(error));
    }
  }
}

export class NoBackend implements SensorBackend {
  readonly id = "none";
  constructor(private readonly detail: string) {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async read(): Promise<Snapshot> {
    return emptySnapshot("backend-missing", "none", this.detail);
  }
}
