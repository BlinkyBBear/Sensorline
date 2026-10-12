/** Per-key runtime statistics: smoothing, min/max hold and trend. */

export type Trend = "up" | "down" | "flat";

export class SensorStats {
  private window: number[] = [];
  /** Smoothed values, newest last (for trend and sparkline). */
  readonly history: number[] = [];
  min: number | null = null;
  max: number | null = null;

  constructor(private readonly historyLength = 120) {}

  /** Adds a raw sample and returns the smoothed value (moving average over `smoothing` samples). */
  push(raw: number | null, smoothing: number): number | null {
    if (raw === null || !Number.isFinite(raw)) return this.history.at(-1) ?? null;
    const n = Math.max(1, Math.min(20, Math.round(smoothing)));
    this.window.push(raw);
    while (this.window.length > n) this.window.shift();
    const value = this.window.reduce((s, x) => s + x, 0) / this.window.length;
    this.history.push(value);
    while (this.history.length > this.historyLength) this.history.shift();
    this.min = this.min === null ? raw : Math.min(this.min, raw);
    this.max = this.max === null ? raw : Math.max(this.max, raw);
    return value;
  }

  resetMinMax(): void {
    this.min = null;
    this.max = null;
  }

  reset(): void {
    this.window = [];
    this.history.length = 0;
    this.resetMinMax();
  }
}

/**
 * Trend over the last `samples` values: slope compared with a dead band of
 * `deadband` × scale span per sample, so noise reads as "flat".
 */
export function trendOf(history: number[], span: number, samples = 6, deadband = 0.004): Trend {
  if (history.length < 3) return "flat";
  const xs = history.slice(-samples);
  const n = xs.length;
  const meanX = (n - 1) / 2;
  const meanY = xs.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  xs.forEach((y, i) => {
    num += (i - meanX) * (y - meanY);
    den += (i - meanX) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const limit = Math.abs(span) * deadband;
  if (slope > limit) return "up";
  if (slope < -limit) return "down";
  return "flat";
}
