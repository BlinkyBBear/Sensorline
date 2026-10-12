/**
 * Generates icons, key images, Marketplace gallery images and the alert sound.
 * Gallery images use the plugin's real renderer (src/render.ts) with sample data.
 * Run: npm run assets
 */
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { COLOURBLIND_ZONES, DEFAULT_ZONES } from "../src/colour.js";
import { render, renderStrip, type StripView } from "../src/render.js";
import type { Sensor, Snapshot } from "../src/sensors/types.js";
import { defaultGauge, defaultMulti, type GaugeSettings, parseGauge, type ResolvedAppearance } from "../src/settings.js";
import { applyRecommendation } from "../src/settings.js";
import { gaugeView, multiView, statusView, type Runtime } from "../src/view.js";
import { monoSvg, MONO, pluginIconSvg } from "./icons.js";

const ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const PLUGIN = path.join(ROOT, "com.rescuecraftstudio.sensorline.sdPlugin");
const MARKET = path.join(ROOT, "marketplace");

function png(svg: string, width?: number): Buffer {
  return new Resvg(svg, { fitTo: width ? { mode: "width", value: width } : { mode: "original" }, font: { loadSystemFonts: true, defaultFontFamily: "IBM Plex Sans" } }).render().asPng();
}
function write(file: string, data: string | Buffer): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
}

// ---- sample data ---------------------------------------------------------------
const s = (id: string, label: string, value: number, type: Sensor["type"], unit: string): Sensor => ({ key: id, id, label, raw: String(value), type, numeric: value, unit });
const SENSORS: Sensor[] = [
  s("TCPU", "CPU", 64, "temp", "°C"),
  s("TGPU1", "GPU", 71, "temp", "°C"),
  s("TGPU1HOT", "GPU Hotspot", 98, "temp", "°C"),
  s("SCPUUTI", "CPU Utilization", 37, "sys", "%"),
  s("SGPU1UTI", "GPU Utilization", 92, "sys", "%"),
  s("SMEMUTI", "Memory Utilization", 58, "sys", "%"),
  s("FCPU", "CPU Fan", 1180, "fan", "RPM"),
  s("PCPUPKG", "CPU Package", 88.4, "pwr", "W"),
  s("TNVME1", "Samsung 990 PRO", 47, "temp", "°C"),
  s("TCOOLANT", "Coolant", 33, "temp", "°C"),
];
const SNAP: Snapshot = { phase: "live", source: "shared-memory", detail: "", sensors: SENSORS };
const APP: ResolvedAppearance = { palette: "default", gradient: "smooth", theme: "default", textSize: "medium", colours: DEFAULT_ZONES, showZoneGlyph: true, showTrend: true };
const rt = (value: number | null, trend: Runtime["trend"] = "flat", history: number[] = []): Runtime => ({ value, history, min: null, max: null, trend, flash: false });
const wave = (base: number, amp: number) => Array.from({ length: 36 }, (_, i) => base + amp * Math.sin(i / 4) + (i / 36) * amp);

function gauge(id: string, patch: Partial<GaugeSettings> = {}, app = APP, runtime?: Runtime, value?: number): string {
  const sensor = SENSORS.find((x) => x.id === id)!;
  const st = { ...applyRecommendation(sensor, defaultGauge()), ...patch };
  const v = value ?? sensor.numeric!;
  return render(gaugeView(st, app, SNAP, runtime ?? rt(v, "up"), { ...sensor, numeric: v }, sensor.key));
}

// ---- icons (the plugin ships SVG action/category icons; PNG copies go to marketplace/icons) ---------------------------------------------------------------------
write(path.join(PLUGIN, "imgs/plugin.png"), png(pluginIconSvg(256)));
write(path.join(PLUGIN, "imgs/plugin@2x.png"), png(pluginIconSvg(512)));
write(path.join(PLUGIN, "imgs/category.svg"), monoSvg("category", 28));
for (const name of Object.keys(MONO).filter((n) => n !== "category")) {
  write(path.join(PLUGIN, `imgs/actions/${name}.svg`), monoSvg(name, 20));
}

// Default key images (state images), 72 and 144 px, from the real renderer.
const keyImages: Record<string, string> = {
  "gauge-key": gauge("TCPU"),
  "cpu-temp-key": gauge("TCPU", { label: "CPU" }),
  "gpu-temp-key": gauge("TGPU1", { label: "GPU" }),
  "cpu-load-key": gauge("SCPUUTI", { label: "CPU" }),
  "gpu-load-key": gauge("SGPU1UTI", { label: "GPU" }),
  "ram-key": gauge("SMEMUTI", { label: "RAM" }),
  "fan-key": gauge("FCPU", { label: "FAN" }),
  "power-key": gauge("PCPUPKG", { label: "CPU W", style: "radial", colorMode: "threshold" }),
  "formula-key": gauge("PCPUPKG", { label: "Formula", style: "value" }),
  "multi-key": render(multiView({ ...defaultMulti(), count: 4, slots: [{ sensorKey: "TCPU", label: "CPU" }, { sensorKey: "TGPU1", label: "GPU" }, { sensorKey: "SCPUUTI", label: "Load" }, { sensorKey: "SMEMUTI", label: "RAM" }] }, APP, SNAP)),
};
for (const [name, svg] of Object.entries(keyImages)) {
  write(path.join(PLUGIN, `imgs/actions/${name}.png`), png(svg, 72));
  write(path.join(PLUGIN, `imgs/actions/${name}@2x.png`), png(svg, 144));
}

// ---- marketplace -----------------------------------------------------------------
write(path.join(MARKET, "app-icon-288.png"), png(pluginIconSvg(288, true)));
write(path.join(MARKET, "plugin-icon-256.png"), png(pluginIconSvg(256)));
write(path.join(MARKET, "plugin-icon-512.png"), png(pluginIconSvg(512)));
for (const name of Object.keys(MONO)) {
  const size = name === "category" ? 28 : 20;
  write(path.join(MARKET, `icons/${name}.svg`), monoSvg(name, size));
  write(path.join(MARKET, `icons/${name}.png`), png(monoSvg(name, size)));
  write(path.join(MARKET, `icons/${name}@2x.png`), png(monoSvg(name, size * 2)));
}

const b64 = (svg: string, w: number) => `data:image/png;base64,${png(svg, w).toString("base64")}`;
function keyTile(svg: string, x: number, y: number, size = 200): string {
  return `<rect x="${x - 8}" y="${y - 8}" width="${size + 16}" height="${size + 16}" rx="${size * 0.16}" fill="#000"/><clipPath id="c${x}_${y}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.12}"/></clipPath><image href="${b64(svg, size)}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#c${x}_${y})"/>`;
}
function canvas(title: string, sub: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="960" viewBox="0 0 1920 960">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171a21"/><stop offset="1" stop-color="#0a0b0e"/></linearGradient></defs>
  <rect width="1920" height="960" fill="url(#bg)"/>
  <text x="120" y="150" font-family="IBM Plex Sans" font-weight="700" font-size="68" fill="#f4f6f8">${title}</text>
  <text x="120" y="215" font-family="IBM Plex Sans" font-size="34" fill="#b4bcc8">${sub}</text>
  ${body}</svg>`;
}
function grid(svgs: string[], cols: number, x0: number, y0: number, size: number, gap: number): string {
  return svgs.map((svg, i) => keyTile(svg, x0 + (i % cols) * (size + gap), y0 + Math.floor(i / cols) * (size + gap), size)).join("");
}

const deck = [
  gauge("TCPU", { label: "CPU" }),
  gauge("TGPU1HOT", { label: "Hotspot" }, APP, rt(98, "up")),
  gauge("SCPUUTI", { label: "CPU", style: "bar" }, APP, rt(37, "down")),
  gauge("SMEMUTI", { label: "RAM", style: "value" }),
  gauge("TNVME1", { label: "NVMe", style: "sparkline" }, APP, rt(47, "up", wave(44, 3))),
  gauge("FCPU", { label: "CPU fan" }),
  keyImages["multi-key"]!,
  gauge("PCPUPKG", { label: "CPU W", style: "bar" }, APP, rt(88.4, "up")),
  gauge("TCOOLANT", { label: "Coolant" }),
  gauge("SGPU1UTI", { label: "GPU" }, APP, rt(92, "up")),
];
const g1 = canvas("Every AIDA64 sensor, live on your keys", "Gauges, bars, readouts and sparklines with colour zones, zone symbols and trend arrows.", grid(deck, 5, 340, 300, 220, 36));

const steps = [25, 40, 55, 68, 74, 80, 86, 92];
const row = (zones: typeof DEFAULT_ZONES, gradient: "smooth" | "stepped") =>
  steps.map((v) => gauge("TCPU", { label: "CPU" }, { ...APP, colours: zones, gradient }, rt(v, "flat"), v));
const g2 = canvas("Smooth colour zones — or colour-blind safe", "Cold, normal, high and critical blend in OKLab. Symbols mark each zone, so colour is never the only cue.",
  `${grid(row(DEFAULT_ZONES, "smooth"), 8, 150, 290, 180, 34)}${grid(row(COLOURBLIND_ZONES, "smooth"), 8, 150, 520, 180, 34)}${grid(row(DEFAULT_ZONES, "stepped").map((x, i) => (i % 2 ? x : x)), 8, 150, 750, 180, 34)}
  <text x="150" y="282" font-family="IBM Plex Sans" font-size="26" fill="#b4bcc8">Default · smooth</text><text x="150" y="512" font-family="IBM Plex Sans" font-size="26" fill="#b4bcc8">Colour-blind safe (Okabe-Ito)</text><text x="150" y="742" font-family="IBM Plex Sans" font-size="26" fill="#b4bcc8">Stepped</text>`);

const strip = (id: string, view: StripView, page: string, value?: number) => {
  const sensor = SENSORS.find((x) => x.id === id)!;
  const st = { ...applyRecommendation(sensor, defaultGauge()), holdMinMax: true };
  const v = gaugeView(st, APP, SNAP, { ...rt(value ?? sensor.numeric, "up", wave(sensor.numeric! * 0.9, sensor.numeric! * 0.06)), min: sensor.numeric! * 0.7, max: sensor.numeric! * 1.1 }, sensor, sensor.key);
  v.history = wave(0.55, 0.08);
  const other = SENSORS.find((x) => x.id === "TGPU1HOT") ?? sensor;
  const second = { title: "GPU Hot", valueText: String(Math.round(other.numeric ?? 0)), unit: "°C", fraction: 0.9, color: APP.colours.high, zone: "high" as const };
  return renderStrip(v, view, page, second);
};
const strips = [strip("TCPU", "bar", "1/3"), strip("TCPU", "arc", "2/3"), strip("SCPUUTI", "sparkline", "36 pts"), strip("TCPU", "split", "")];
const stripTiles = strips.map((svg, i) => `<image href="data:image/png;base64,${png(svg, 400).toString("base64")}" x="${160 + i * 410}" y="420" width="400" height="200"/>`).join("");
const g3 = canvas("Stream Deck + dials and touch strip", "Bar, arc, sparkline or split views. Rotate to cycle sensors, adjust limits or the time window.",
  `<rect x="140" y="400" width="1640" height="240" rx="24" fill="#000"/>${stripTiles}${[0, 1, 2, 3].map((i) => `<circle cx="${360 + i * 410}" cy="770" r="70" fill="#22252b" stroke="#3a3f48" stroke-width="6"/>`).join("")}`);

const statusKeys = [
  render(statusView({ ...SNAP, phase: "not-running" }, APP)!),
  render(statusView({ ...SNAP, phase: "sharing-off" }, APP)!),
  gauge("TCPU", { label: "CPU" }, { ...APP, theme: "high-contrast" }),
  gauge("SGPU1UTI", { label: "GPU", style: "bar" }, { ...APP, theme: "high-contrast" }, rt(92, "up")),
  gauge("TCPU", { label: "CPU" }, { ...APP, theme: "dark" }, rt(81, "up"), 81),
  gauge("SMEMUTI", { label: "RAM", style: "value", textSize: "large" } as Partial<GaugeSettings>, { ...APP, textSize: "large" }),
];
const g4 = canvas("Help on the key, themes for every setup", "Setup steps when AIDA64 is closed or not sharing. High-contrast and dark themes, three text sizes.", grid(statusKeys, 6, 150, 380, 240, 36));

const gallery = [g1, g2, g3, g4];
gallery.forEach((svg, i) => write(path.join(MARKET, `gallery-${i + 1}.png`), png(svg)));
write(path.join(MARKET, "thumbnail.png"), png(g1));

// ---- alert sound: generated two-tone chime (CC0, made by this script) ---------------
function wav(): Buffer {
  const rate = 22050;
  const tones: [number, number][] = [[880, 0.16], [1318.5, 0.26]];
  const samples: number[] = [];
  for (const [f, d] of tones) {
    const n = Math.round(rate * d);
    for (let i = 0; i < n; i += 1) {
      const env = Math.min(1, i / 200) * Math.exp((-3 * i) / n);
      samples.push(Math.round(Math.sin((2 * Math.PI * f * i) / rate) * env * 0.5 * 32767));
    }
  }
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(v, i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
write(path.join(PLUGIN, "sounds/alert.wav"), wav());
void parseGauge;
console.log("Assets written to", PLUGIN, "and", MARKET);
