import type { Zone } from "./colour.js";

export type AlertLevel = "off" | "high" | "crit";

export interface AlertConfig {
  level: AlertLevel;
  flash: boolean;
  sound: boolean;
  /** Consecutive samples in the zone before the alert fires (debounce). */
  confirm: number;
  /** Minimum time between sounds, in ms. */
  soundCooldownMs: number;
}

export interface AlertState {
  active: boolean;
  streak: number;
  clearStreak: number;
  lastSoundAt: number;
  flashOn: boolean;
}

export interface AlertOutcome {
  active: boolean;
  /** True on the sample where the alert started. */
  started: boolean;
  /** Flash phase for this frame (alternates while active). */
  flashOn: boolean;
  playSound: boolean;
}

export const newAlertState = (): AlertState => ({ active: false, streak: 0, clearStreak: 0, lastSoundAt: -Infinity, flashOn: false });

const RANK: Record<Zone, number> = { cold: 0, normal: 1, high: 2, crit: 3 };

export function inAlertZone(level: AlertLevel, zone: Zone | null): boolean {
  if (level === "off" || zone === null) return false;
  return RANK[zone] >= (level === "high" ? 2 : 3);
}

/**
 * Advances the alert state machine by one sample. The alert starts after
 * `confirm` samples in the zone and clears after `confirm` samples out of it
 * (simple hysteresis, so a value hovering at the limit does not flicker).
 */
export function stepAlert(state: AlertState, cfg: AlertConfig, zone: Zone | null, now: number): AlertOutcome {
  const hit = inAlertZone(cfg.level, zone);
  const confirm = Math.max(1, Math.round(cfg.confirm));
  let started = false;
  if (hit) {
    state.streak += 1;
    state.clearStreak = 0;
    if (!state.active && state.streak >= confirm) {
      state.active = true;
      started = true;
    }
  } else {
    state.streak = 0;
    if (state.active) {
      state.clearStreak += 1;
      if (state.clearStreak >= confirm) state.active = false;
    }
  }
  if (!state.active) state.flashOn = false;
  else state.flashOn = cfg.flash ? !state.flashOn : false;
  let playSound = false;
  if (started && cfg.sound && now - state.lastSoundAt >= cfg.soundCooldownMs) {
    playSound = true;
    state.lastSoundAt = now;
  }
  return { active: state.active, started, flashOn: state.flashOn, playSound };
}
