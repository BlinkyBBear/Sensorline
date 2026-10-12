# Sensorline 1.2.0

**New**
- Zone symbols (▽ ● △ ⚠) and trend arrows on every key, so colour is never the only cue.
- Colour-blind safe palette, custom zone colours, smooth (OKLab) or stepped gradient.
- High-contrast and dark themes, three text sizes, and global defaults that each key can override.
- One-click keys: CPU temperature, GPU temperature (new), CPU load, GPU load, RAM usage, fan speed, CPU power.
- Sensor Dial for Stream Deck +, with every Gauge option: bar, gauge arc, sparkline, two-sensor split or large value on the touch strip. Rotate cycles a sensor list, adjusts a threshold or changes the sparkline window. Press, tap and long touch can be set. Includes a Formula mode and presets.
- Formula keys: combine up to eight sensors, for example `max(a, b)`.
- Alerts: flash the key and/or play a short chime when a sensor reaches High or Critical.
- Smoothing, min/max hold, raw sensor ID entry, key press actions (refresh, next sensor, reset min/max, open AIDA64), settings export/import, "Preview warning colours".
- Suggested limits per sensor (CPU, GPU, GPU hotspot, NVMe, HDD, DIMM, chipset, VRM, coolant, power, utilisation).

**Improved**
- On-key setup steps when AIDA64 is closed or not sharing. The inspector shows the active source (shared memory, WMI or registry).
- Polling slows to every 5 s while AIDA64 is closed, and recovers on its own when AIDA64 restarts.
- Larger, higher-contrast text (at least 4.5:1) that stays readable on 72 px keys.
- Search box for long sensor lists. Dropdowns no longer close while you choose.

**Fixed**
- Startup crash "Dynamic require of "events" is not supported".
- Corrupted dashes and arrows in text.

Settings from 1.0 and 1.1 are upgraded automatically.
