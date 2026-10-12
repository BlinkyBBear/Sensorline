import { selectBackend, type SensorBackend } from "./backends/index.js";
import type { Snapshot } from "./sensors/types.js";

export interface Log {
  info(message: string): void;
  error(message: string): void;
}

/** Polls the active backend and notifies listeners after every read. */
export class SensorPoller {
  snapshot: Snapshot = { phase: "backend-missing", source: "none", detail: "Starting…", sensors: [] };
  private backend: SensorBackend;
  private timer: NodeJS.Timeout | null = null;
  private intervalMs = 1000;
  private running = false;
  private reading = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly log: Log, private readonly factory: () => SensorBackend = selectBackend) {
    this.backend = factory();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setIntervalMs(ms: number): void {
    this.intervalMs = ms;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.backend = this.factory();
    await this.backend.start();
    await this.readNow();
    this.arm();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.backend.stop();
  }

  async restart(): Promise<void> {
    const was = this.running;
    await this.stop();
    if (was) await this.start();
  }

  async readNow(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    try {
      const next = await this.backend.read();
      const changed = next.phase !== this.snapshot.phase || next.source !== this.snapshot.source;
      this.snapshot = next;
      if (changed) this.log.info(`Sensors ${next.phase} via ${next.source}: ${next.detail}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error(`Sensor read failed: ${message}`);
      this.snapshot = { phase: "error", source: this.backend.id, detail: message, sensors: [] };
    } finally {
      this.reading = false;
      for (const listener of this.listeners) listener();
    }
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.readNow().finally(() => this.arm());
    }, this.intervalMs);
  }
}

/** A signature of the sensor list (keys + phase). Changes only when sensors appear/disappear. */
export function listSignature(snapshot: Snapshot): string {
  return `${snapshot.phase}|${snapshot.sensors.map((s) => s.key).join(",")}`;
}
