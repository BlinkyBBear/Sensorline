import type { Snapshot } from "./sensors/types.js";

/**
 * Extension points for deferred features. Nothing is registered in 1.2.
 *
 * - Logging to file: register an `onSnapshot` hook that appends readings to a CSV.
 * - Remote PCs: implement `SensorBackend` (src/backends/backend.ts) for a network
 *   feed and return it from `selectBackend`.
 */
export interface SensorlineHooks {
  onSnapshot?(snapshot: Snapshot): void;
}

const hooks: SensorlineHooks[] = [];

export function registerHooks(h: SensorlineHooks): void {
  hooks.push(h);
}

export function runSnapshotHooks(snapshot: Snapshot): void {
  for (const h of hooks) {
    try {
      h.onSnapshot?.(snapshot);
    } catch {
      /* hooks must never break polling */
    }
  }
}
