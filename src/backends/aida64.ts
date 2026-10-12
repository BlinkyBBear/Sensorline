import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseAidaXml, parseValueMap } from "../sensors/parse.js";
import { emptySnapshot, type Snapshot } from "../sensors/types.js";
import { errorMessage, type SensorBackend } from "./backend.js";

/** One JSON line written by aida-bridge.ps1 per "read" command. */
interface BridgeReply {
  ok: boolean;
  source?: string;
  kind?: "xml" | "map";
  payload?: string;
  reason?: string;
  detail?: string;
}

function bridgeScript(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "aida-bridge.ps1");
}

function powershell(): string {
  const root = process.env.SystemRoot || "C:\\Windows";
  return path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/**
 * AIDA64 Extreme on Windows. A long-lived PowerShell bridge tries, in order:
 * shared memory (AIDA64_SensorValues), WMI (root\WMI AIDA64_SensorValues),
 * then the registry (HKCU\Software\FinalWire\AIDA64\SensorValues).
 */
export class Aida64Backend implements SensorBackend {
  readonly id = "aida64";
  private child: ChildProcessWithoutNullStreams | null = null;
  private waiters: { resolve: (line: string) => void; reject: (error: Error) => void }[] = [];
  private stderr = "";

  async start(): Promise<void> {
    this.spawn();
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.failAll(new Error("Bridge stopped"));
    if (!child) return;
    try {
      child.stdin.write("quit\n");
    } catch {
      /* already gone */
    }
    child.kill();
  }

  async read(): Promise<Snapshot> {
    try {
      return Aida64Backend.parseLine(await this.request());
    } catch (error) {
      return emptySnapshot("error", "aida64", errorMessage(error));
    }
  }

  private spawn(): void {
    if (this.child) return;
    const child = spawn(powershell(), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", bridgeScript()], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.stderr = "";
    createInterface({ input: child.stdout }).on("line", (line) => this.waiters.shift()?.resolve(line));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-2000);
    });
    child.on("error", (error) => {
      if (this.child === child) this.child = null;
      this.failAll(error);
    });
    child.on("exit", () => {
      if (this.child === child) this.child = null;
      this.failAll(new Error(this.stderr.trim() || "AIDA64 bridge exited"));
    });
  }

  private failAll(error: Error): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter.reject(error);
  }

  private request(): Promise<string> {
    this.spawn();
    const child = this.child;
    if (!child) return Promise.reject(new Error("AIDA64 bridge is not running"));
    return new Promise((resolve, reject) => {
      const done = (line: string) => {
        clearTimeout(timer);
        resolve(line);
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.resolve !== done);
        reject(new Error("AIDA64 bridge timed out"));
        void this.stop();
      }, 8000);
      this.waiters.push({
        resolve: done,
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write("read\n");
    });
  }

  static parseLine(line: string): Snapshot {
    let reply: BridgeReply;
    try {
      reply = JSON.parse(line) as BridgeReply;
    } catch {
      return emptySnapshot("error", "aida64", "Bridge returned an unreadable line");
    }
    const source = reply.source || "none";
    if (!reply.ok) {
      const phase = reply.reason === "sharing-off" ? "sharing-off" : reply.reason === "not-running" ? "not-running" : "error";
      return emptySnapshot(phase, source, reply.detail || "No sensor data");
    }
    const text = Buffer.from(reply.payload || "", "base64").toString("utf8");
    try {
      const sensors = reply.kind === "map" ? parseValueMap(JSON.parse(text) as Record<string, string>) : parseAidaXml(text);
      if (sensors.length === 0) return emptySnapshot("sharing-off", source, "AIDA64 replied, but the sensor list was empty.");
      return { phase: "live", source, detail: `${sensors.length} sensors via ${source}.`, sensors };
    } catch (error) {
      return emptySnapshot("error", source, errorMessage(error));
    }
  }
}
