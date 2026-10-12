# Sensorline

An open-source Elgato Stream Deck plugin that shows sensors shared by **AIDA64 Extreme**
(temperatures, fans, voltages, current, power, clocks, utilisation, disks, network …) as
radial gauges, bars, readouts, sparklines, or 2–4 sensors per key.

**Requires AIDA64 Extreme** (sold separately by FinalWire) on Windows 10+, and Stream Deck 7.1+.

- **Sources, in order:** AIDA64 shared memory → WMI (`root\WMI` `AIDA64_SensorValues`) → registry (`HKCU\Software\FinalWire\AIDA64\SensorValues`). No admin rights needed.
- **Colour zones:** Cold / Normal / High / Critical, with a **smooth OKLab gradient** (or **Stepped**), a **colour-blind safe** palette (Okabe-Ito blue → orange), or **custom** colours per key.
- **Per-sensor defaults:** picking a sensor fills in sensible limits ([docs/thresholds.md](docs/thresholds.md)); you can override them.
- **Accessible:** zone symbols (▽ ● △ ⚠) and trend arrows, so colour is never the only cue. Value text is at least 4.5:1 contrast. High-contrast and dark themes, three text sizes.
- **Help on the key:** setup steps when AIDA64 is closed or not sharing. The inspector shows the active source.
- **Actions (11):** CPU Temperature, GPU Temperature, CPU Load, GPU Load, RAM Usage, Fan Speed, CPU Power (one-click presets), Sensor Gauge, Multi Sensor, Formula (2–8 sensors, safe parser, no `eval`), Sensor Dial (Stream Deck +: every Gauge option plus five strip layouts — bar, arc, sparkline, two-sensor split, large value — formula mode, and configurable rotate / press / tap / long-touch).
- **Power-user options:** global defaults with per-key overrides, smoothing, min/max hold, poll interval, raw sensor ID, key press actions (refresh, next sensor, reset min/max, open AIDA64), settings export/import, alerts (flash, chime), "Preview warning colours".
- **Efficient:** one shared poller for all keys, a 5 s tier while AIDA64 is closed, auto-recovery when AIDA64 restarts or the bridge fails, no admin rights, and images are only sent when they change.

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
npm run assets     # regenerate icons, key images, Marketplace gallery and the alert sound
```

See [docs/build-and-release.md](docs/build-and-release.md) for reproducible builds and code signing, [docs/marketplace.md](docs/marketplace.md) for the guideline checklist and open decisions, and [docs/testing.md](docs/testing.md) for the hardware test checklist.

For development, `npx streamdeck link com.rescuecraftstudio.sensorline.sdPlugin` then `npm run watch`.

The bundle is ESM. The SDK's `ws` dependency is CommonJS, so `build.mjs` adds a
`createRequire` banner; without it Node fails with `Dynamic require of "events" is not supported`.

## Layout

```
src/
  plugin.ts            entry: registers actions, wires the poller
  actions/             presets, Gauge, Multi, Formula, Dial
  backends/            SensorBackend interface; AIDA64 (Windows), file, script, lm-sensors
  sensors/             AIDA64 XML / map / JSON parsing, threshold recommendations
  colour.ts            OKLab maths, palettes, zones, WCAG contrast
  theme.ts             themes, text sizes, readable text colours
  formula.ts           safe expression parser for Formula keys
  alerts.ts stats.ts   alert state machine; smoothing, min/max, trend
  migrate.ts           1.0 / 1.1 → 1.2 settings migration
  hooks.ts             extension points (file logging, remote PCs: deferred)
  settings.ts view.ts render.ts hub.ts poller.ts platform.ts
com.rescuecraftstudio.sensorline.sdPlugin/
  manifest.json  bin/aida-bridge.ps1  ui/  imgs/  layouts/  sounds/
marketplace/           app icon, plugin icons, mono icons, gallery, description, keywords, release notes
test/                  vitest
releases/              previous packaged builds
```

## Other sources

Set one of these environment variables for the Stream Deck process:

- `SENSORLINE_FILE` — a file containing AIDA64-style XML or JSON.
- `SENSORLINE_SCRIPT` — a command that prints AIDA64-style XML or JSON.

On Linux the plugin falls back to `lm-sensors` (`sensors -j`). This is a separate, generic
backend, not AIDA64. New backends implement `SensorBackend` in `src/backends/backend.ts`.

## Not included yet

Logging readings to a file and reading remote PCs are planned. The extension points are `src/hooks.ts` and the `SensorBackend` interface.
Switching profiles on an alert needs a profile bundled with the plugin (an SDK rule), so it is not offered; see docs/marketplace.md.

## License

MIT — see [LICENSE](LICENSE). Sensorline is sold on the Elgato Marketplace; the source stays open.
AIDA64 is a trademark of FinalWire Ltd. Sensorline is not affiliated with FinalWire.
