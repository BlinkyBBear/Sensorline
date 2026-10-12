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
  private errorStreak = 0;

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
      this.errorStreak = next.phase === "error" ? this.errorStreak + 1 : 0;
      if (this.errorStreak >= ERRORS_BEFORE_RESTART) await this.recover();
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

  /** Restarts the backend (e.g. the PowerShell bridge) after repeated read errors. */
  private async recover(): Promise<void> {
    this.errorStreak = 0;
    this.log.info(`Restarting the ${this.backend.id} backend after repeated errors`);
    try {
      await this.backend.stop();
      await this.backend.start();
    } catch (error) {
      this.log.error(`Backend restart failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Interval for the next poll: the slow tier while AIDA64 is absent. */
  currentInterval(): number {
    return slowTier(this.snapshot.phase) ? Math.max(this.intervalMs, SLOW_INTERVAL) : this.intervalMs;
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.readNow().finally(() => this.arm());
    }, this.currentInterval());
  }
}

/** Poll interval while AIDA64 is not running / not sharing. */
export const SLOW_INTERVAL = 5000;
export const ERRORS_BEFORE_RESTART = 3;

/** Phases where AIDA64 is absent and polling slows down. */
export function slowTier(phase: Snapshot["phase"]): boolean {
  return phase === "not-running" || phase === "sharing-off" || phase === "backend-missing";
}

/** A signature of the sensor list (keys + phase). Changes only when sensors appear/disappear. */
export function listSignature(snapshot: Snapshot): string {
  return `${snapshot.phase}|${snapshot.sensors.map((s) => s.key).join(",")}`;
}
