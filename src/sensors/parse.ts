import { SENSOR_TYPES, type Sensor, type SensorHint, type SensorType } from "./types.js";

function decodeXml(text: string): string {
  const entities: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&([a-z]+);/g, (whole, name: string) => entities[name] ?? whole)
    .trim();
}

function normaliseUnit(unit: string): string {
  return unit.replace(/^°\s*/, "°").trim();
}

/** Splits an AIDA64 value such as "45", "1.234 V" or "37 °C" into a number and unit. */
export function parseValue(value: string): { numeric: number | null; unit: string } {
  const match = value.trim().match(/^(-?\d+(?:[.,]\d+)?)(?:\s*([°%][\w./]*|[A-Za-z][\w./]*))?$/);
  if (!match) return { numeric: null, unit: "" };
  const numeric = Number(match[1]!.replace(",", "."));
  return Number.isFinite(numeric) ? { numeric, unit: normaliseUnit(match[2] ?? "") } : { numeric: null, unit: "" };
}

/** Guesses a sensor type from the unit, then from the AIDA64 id prefix. */
export function inferType(id: string, unit: string): SensorType {
  const upper = id.toUpperCase();
  if (unit === "°C" || unit === "°F" || unit === "C") return "temp";
  if (unit === "RPM") return "fan";
  if (unit === "V") return "volt";
  if (unit === "A") return "curr";
  if (unit === "W") return "pwr";
  if (unit === "%") return "duty";
  if (upper.startsWith("T")) return "temp";
  if (upper.startsWith("F")) return "fan";
  if (upper.startsWith("V")) return "volt";
  if (upper.startsWith("P")) return "pwr";
  if (upper.startsWith("C") && !upper.startsWith("CC")) return "curr";
  if (upper.startsWith("D")) return "duty";
  return "sys";
}

function tagType(tag: string): SensorType {
  const lower = tag.toLowerCase();
  if (SENSOR_TYPES.has(lower)) return lower as SensorType;
  if (lower === "pump" || lower === "flow") return "fan";
  return "other";
}

function readEntry(body: string): { id: string; label: string; value: string } | null {
  const fields: Record<string, string> = {};
  const pattern = /<(id|label|value)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body))) fields[match[1]!.toLowerCase()] = decodeXml(match[2]!);
  if (!fields.id || fields.value === undefined) return null;
  const rest = body.replace(/<(id|label|value)>[\s\S]*?<\/\1>/gi, "");
  if (/<[a-zA-Z]/.test(rest)) return null;
  return { id: fields.id, label: fields.label ?? fields.id, value: fields.value };
}

function nextKey(id: string, seen: Map<string, number>): string {
  const count = seen.get(id) ?? 0;
  seen.set(id, count + 1);
  return count === 0 ? id : `${id}#${count + 1}`;
}

function toSensor(entry: { id: string; label: string; value: string }, type: SensorType, seen: Map<string, number>): Sensor {
  const parsed = parseValue(entry.value);
  return {
    key: nextKey(entry.id, seen),
    id: entry.id,
    label: entry.label || entry.id,
    raw: entry.value,
    type: type === "other" ? inferType(entry.id, parsed.unit) : type,
    numeric: parsed.numeric,
    unit: parsed.unit,
  };
}

/** Parses the AIDA64 shared-memory XML: <sys><id>…</id><label>…</label><value>…</value></sys>… */
export function parseAidaXml(text: string): Sensor[] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\u0000/g, "").trim();
  if (!clean) return [];
  const sensors: Sensor[] = [];
  const seen = new Map<string, number>();
  const walk = (chunk: string): void => {
    const pattern = /<([a-zA-Z][\w-]*)>([\s\S]*?)<\/\1>/g;
    let match: RegExpExecArray | null;
    let found = false;
    while ((match = pattern.exec(chunk))) {
      found = true;
      const tag = match[1]!;
      const body = match[2]!;
      const lower = tag.toLowerCase();
      if (lower === "id" || lower === "label" || lower === "value") continue;
      const entry = readEntry(body);
      if (entry) sensors.push(toSensor(entry, tagType(tag), seen));
      else walk(body);
    }
    if (!found) {
      const entry = readEntry(chunk);
      if (entry) sensors.push(toSensor(entry, "other", seen));
    }
  };
  walk(clean.includes("<") ? clean : `<root>${clean}</root>`);
  return sensors;
}

/** Parses a flat name→value map (WMI properties or registry values). */
export function parseValueMap(map: Record<string, string>): Sensor[] {
  const labels = new Map<string, string>();
  const xmlChunks: string[] = [];
  for (const [name, value] of Object.entries(map)) {
    const labelMatch = name.match(/^(?:label[_:-]?)(.+)$/i);
    if (labelMatch && !value.includes("<id>")) {
      labels.set(labelMatch[1]!.toUpperCase(), value);
      continue;
    }
    if (value.includes("<id>")) xmlChunks.push(value);
  }
  const fromXml = xmlChunks.flatMap((chunk) => parseAidaXml(chunk));
  if (fromXml.length > 0 && Object.keys(map).length <= xmlChunks.length + labels.size) return fromXml;
  const seen = new Map<string, number>();
  const sensors = [...fromXml];
  for (const sensor of fromXml) seen.set(sensor.id, (seen.get(sensor.id) ?? 0) + 1);
  for (const [name, value] of Object.entries(map)) {
    if (/^(?:label[_:-]?)/i.test(name) || value.includes("<id>")) continue;
    const parsed = parseValue(value);
    sensors.push({
      key: nextKey(name, seen),
      id: name,
      label: labels.get(name.toUpperCase()) || name,
      raw: value,
      type: inferType(name, parsed.unit),
      numeric: parsed.numeric,
      unit: parsed.unit,
    });
  }
  return sensors;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return !value || typeof value !== "object" || Array.isArray(value) ? null : (value as Record<string, unknown>);
}

function fromJsonEntry(value: unknown, seen: Map<string, number>): Sensor | null {
  const obj = asObject(value);
  if (!obj) return null;
  const id = typeof obj.id === "string" ? obj.id : "";
  if (!id) return null;
  const label = typeof obj.label === "string" && obj.label ? obj.label : id;
  const raw =
    typeof obj.value === "string"
      ? obj.value
      : typeof obj.value === "number" && Number.isFinite(obj.value)
        ? String(obj.value)
        : "";
  const parsed = parseValue(raw);
  const type = typeof obj.type === "string" && SENSOR_TYPES.has(obj.type) ? (obj.type as SensorType) : inferType(id, parsed.unit);
  const hint = asObject(obj.hint) as SensorHint | null;
  return {
    key: nextKey(id, seen),
    id,
    label,
    raw,
    type,
    numeric: parsed.numeric,
    unit: typeof obj.unit === "string" ? obj.unit : parsed.unit,
    hint: hint || undefined,
  };
}

function lmType(field: string): SensorType {
  if (field.startsWith("temp")) return "temp";
  if (field.startsWith("fan")) return "fan";
  if (field.startsWith("in")) return "volt";
  if (field.startsWith("curr")) return "curr";
  if (field.startsWith("power")) return "pwr";
  return "other";
}

function finiteField(obj: Record<string, unknown>, name: string): number | undefined {
  const value = obj[name];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Rounds a scale maximum up to a friendly number. */
export function niceMax(value: number): number {
  const steps = [100, 250, 500, 800, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 16000, 32000, 64000];
  for (const step of steps) if (value <= step) return step;
  return Math.ceil(value / 10000) * 10000;
}

/** Parses `sensors -j` (lm-sensors) output. Used by the generic Linux backend, not AIDA64. */
export function parseLmSensors(value: unknown): Sensor[] {
  const root = asObject(value);
  if (!root) return [];
  const sensors: Sensor[] = [];
  const seen = new Map<string, number>();
  for (const [chip, chipValue] of Object.entries(root)) {
    const chipObj = asObject(chipValue);
    if (!chipObj) continue;
    const chipName = chip.split("-")[0] || chip;
    for (const [feature, featureValue] of Object.entries(chipObj)) {
      if (feature === "Adapter" || typeof featureValue !== "object" || !featureValue) continue;
      const fields = featureValue as Record<string, unknown>;
      for (const [field, reading] of Object.entries(fields)) {
        if (!field.endsWith("_input") || typeof reading !== "number" || !Number.isFinite(reading)) continue;
        const type = lmType(field);
        const id = `${chip}.${feature}.${field}`;
        const max = finiteField(fields, field.replace(/_input$/, "_max"));
        const crit = finiteField(fields, field.replace(/_input$/, "_crit"));
        const hint: SensorHint = {};
        if (type === "temp") {
          hint.min = 0;
          hint.max = Math.max(100, crit ?? max ?? 100);
          hint.unit = "°C";
          hint.decimals = 0;
          hint.style = "radial";
          if (max !== undefined) hint.warn = max;
          if (crit !== undefined) hint.crit = crit;
        } else if (type === "fan") {
          hint.min = 0;
          hint.unit = "RPM";
          hint.decimals = 0;
          hint.style = "bar";
          hint.max = niceMax(Math.max(1500, reading * 1.6));
        } else if (type === "volt") {
          hint.unit = "V";
          hint.decimals = 3;
          hint.style = "value";
        }
        sensors.push({
          key: nextKey(id, seen),
          id,
          label: `${feature} · ${chipName}`,
          raw: String(reading),
          type,
          numeric: reading,
          unit: hint.unit ?? "",
          hint,
        });
      }
    }
  }
  return sensors;
}

/** Parses a JSON sensor feed: an array of {id,label,value}, {sensors:[…]}, a flat map, or lm-sensors JSON. */
export function parseJsonFeed(value: unknown): Sensor[] {
  if (Array.isArray(value)) {
    const seen = new Map<string, number>();
    return value.flatMap((entry) => {
      const sensor = fromJsonEntry(entry, seen);
      return sensor ? [sensor] : [];
    });
  }
  const obj = asObject(value);
  if (!obj) return [];
  if (Array.isArray(obj.sensors)) return parseJsonFeed(obj.sensors);
  const values = Object.values(obj);
  if (values.length > 0 && values.every((v) => typeof v === "string" || typeof v === "number")) {
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) map[k] = String(v);
    return parseValueMap(map);
  }
  return parseLmSensors(obj);
}

/** Parses any supported text feed: AIDA64 XML first, then JSON. */
export function parseFeed(text: string): Sensor[] {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];
  if (clean.startsWith("<") || clean.includes("<id>")) {
    const xml = parseAidaXml(clean);
    if (xml.length > 0) return xml;
  }
  try {
    return parseJsonFeed(JSON.parse(clean));
  } catch {
    return [];
  }
}
