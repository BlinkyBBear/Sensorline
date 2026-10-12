import { obj, SCHEMA } from "./settings.js";

export type SettingsOrigin = "1.0" | "1.1" | "current";

/**
 * Upgrades stored per-key settings to the current schema. Pure: returns a new
 * object and where it came from. Unknown keys are kept, so nothing is lost.
 *
 * 1.0 (shipped package): no `schema`, no colour options, Multi stored
 *   `slots: [{sensorKey,label}]`, numbers sometimes stored as strings.
 * 1.1 (PR build): no `schema`, but has `palette` / `gradient` / `colCold`…
 * 1.2: `schema: 3`, inheritable appearance, alerts, power-user options.
 */
export function migrateSettings(raw: unknown): { settings: Record<string, unknown>; from: SettingsOrigin; changed: boolean } {
  const input = obj(raw);
  if (typeof input.schema === "number" && input.schema >= SCHEMA) return { settings: { ...input }, from: "current", changed: false };
  const from: SettingsOrigin = "palette" in input || "gradient" in input || "colCold" in input ? "1.1" : "1.0";
  const out: Record<string, unknown> = { ...input };

  // Multi 1.0: slots array → slot0..3 / slotLabel0..3 (sdpi fields).
  if (Array.isArray(input.slots)) {
    (input.slots as unknown[]).slice(0, 4).forEach((slot, i) => {
      const s = obj(slot);
      if (typeof s.sensorKey === "string" && !out[`slot${i}`]) out[`slot${i}`] = s.sensorKey;
      if (typeof s.label === "string" && !out[`slotLabel${i}`]) out[`slotLabel${i}`] = s.label;
    });
    delete out.slots;
  }

  // Numbers saved as strings by older inspectors.
  for (const key of ["min", "max", "cold", "warn", "crit", "decimals", "intervalMs", "count"]) {
    const v = out[key];
    if (typeof v === "string") out[key] = v.trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : v;
  }

  if (from === "1.0") {
    // 1.0 used a fixed blue→red spectrum: follow the new global defaults.
    out.palette = "inherit";
    out.gradient = "inherit";
  }
  // 1.1 values (palette/gradient/colours) are explicit user choices: keep them.

  out.theme ??= "inherit";
  out.textSize ??= "inherit";
  out.schema = SCHEMA;
  return { settings: out, from, changed: true };
}
