# Sensorline

An open-source Elgato Stream Deck plugin that shows sensors shared by **AIDA64 Extreme**
(temperatures, fans, voltages, current, power, clocks, utilisation, disks, network …) as
radial gauges, bars, readouts, sparklines, or 2–4 sensors per key.

- **Sources, in order:** AIDA64 shared memory → WMI (`root\WMI` `AIDA64_SensorValues`) → registry (`HKCU\Software\FinalWire\AIDA64\SensorValues`). No admin rights needed.
- **Colour zones:** Cold / Normal / High / Critical, with a **smooth OKLab gradient** (or **Stepped**), a **colour-blind safe** palette (Okabe-Ito blue → orange), or **custom** colours per key.
- **Per-sensor defaults:** picking a sensor fills in sensible limits ([docs/thresholds.md](docs/thresholds.md)); you can override them.

AIDA64 Extreme is Windows-only. The plugin also runs on macOS/Linux, but only with a
custom feed (see *Other sources*); it does not read AIDA64 natively there.

## Install

1. Download `com.rescuecraftstudio.sensorline.streamDeckPlugin` (build it yourself, below) and double-click it.
2. Stream Deck 7.1+ on Windows 10+ (Node 20 runtime is bundled with Stream Deck).

## AIDA64 setup

1. AIDA64 Extreme → **File → Preferences → Hardware Monitoring → External Applications**.
2. Tick **Enable shared memory** (WMI and registry also work as fallbacks).
3. Tick the sensors you want to see, then **OK**.
4. Add a Sensorline key and choose a sensor. Use the **Search** box to filter long lists.

## Build

Requires Node 20+.

```sh
npm install
npm run build      # esbuild → com.rescuecraftstudio.sensorline.sdPlugin/bin/plugin.js
npm test           # vitest: colour interpolation and threshold mapping
npm run lint       # TypeScript type-check and UTF-8/mojibake check
npm run pack       # build + @elgato/cli pack → dist/com.rescuecraftstudio.sensorline.streamDeckPlugin
```

For development, `npx streamdeck link com.rescuecraftstudio.sensorline.sdPlugin` then `npm run watch`.

The bundle is ESM. The SDK's `ws` dependency is CommonJS, so `build.mjs` adds a
`createRequire` banner; without it Node fails with `Dynamic require of "events" is not supported`.

## Layout

```
src/
  plugin.ts            entry: registers actions, wires the poller
  actions/             Gauge, Multi and the six one-click monitor keys
  backends/            SensorBackend interface; AIDA64 (Windows), file, script, lm-sensors
  sensors/             AIDA64 XML / map / JSON parsing, threshold recommendations
  colour.ts            OKLab maths, palettes, zone → colour mapping
  settings.ts view.ts render.ts hub.ts poller.ts
com.rescuecraftstudio.sensorline.sdPlugin/
  manifest.json  bin/aida-bridge.ps1  ui/  imgs/
test/                  vitest
releases/              previous packaged builds
```

## Other sources

Set one of these environment variables for the Stream Deck process:

- `SENSORLINE_FILE` — a file containing AIDA64-style XML or JSON.
- `SENSORLINE_SCRIPT` — a command that prints AIDA64-style XML or JSON.

On Linux the plugin falls back to `lm-sensors` (`sensors -j`). This is a separate, generic
backend, not AIDA64. New backends implement `SensorBackend` in `src/backends/backend.ts`.

## License

MIT — see [LICENSE](LICENSE).
