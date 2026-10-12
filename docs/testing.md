# Hardware test checklist (1.2.0)

Run on Windows 10/11, Stream Deck 7.1+, AIDA64 Extreme with External Applications → shared memory on.

- [ ] Install over 1.0: existing keys keep their sensors and limits (migration), Multi keys keep their slots.
- [ ] Each one-click key (CPU/GPU temperature, CPU/GPU load, RAM, fan, CPU power) finds the right sensor.
- [ ] 72 px keys (MK.2/Mini/XL) and the 4-sensor Multi layout are readable at arm's length.
- [ ] Zone symbols and trend arrows look right; Preview warning colours steps through all four zones.
- [ ] Themes (default, dark, high contrast) and text sizes; global defaults change every "inherit" key.
- [ ] Search box filters the sensor dropdown and the dropdown no longer closes while open.
- [ ] Inspector status shows Shared memory; turn shared memory off → WMI or Registry is shown.
- [ ] Close AIDA64 → key shows "AIDA64 off" steps within 5 s; reopen → values return without touching anything.
- [ ] Sharing off → key shows the three setup steps.
- [ ] Alerts: flash and chime when a sensor crosses High/Critical; chime at most every 30 s.
- [ ] Key press actions: next sensor, reset min/max, open AIDA64 (default path and custom path).
- [ ] Settings export → import onto another key.
- [ ] Formula key: `max(a, b)` with CPU and GPU temperature; an invalid formula shows the red message.
- [ ] Virtual Stream Deck and Stream Deck Mobile show keys correctly.
- [ ] Sleep/wake the PC: values resume.
- [ ] Runs without administrator rights.

## Stream Deck + Sensor Dial

Test on a real Stream Deck + with AIDA64 sharing. Check each item on all four dials at least once.

**Setup and data**
- [ ] Drop a Sensor Dial on a fresh dial: the strip shows "Choose sensor" and the trigger hints show in the Stream Deck app (Rotate / Push / Touch / Long touch).
- [ ] With AIDA64 closed, the strip shows "AIDA64 off / Start AIDA64 Extreme". With sharing off, it shows the three setup steps. Starting AIDA64 recovers within 5 s, with no restart needed.
- [ ] Search filters the Sensor, cycle list, Split sensor and formula input lists.
- [ ] Picking a sensor fills in the unit, decimals, min/max and Cold/High/Critical. "Use recommended thresholds" refills them after you edit them.
- [ ] Each preset (CPU/GPU temperature, CPU/GPU load, RAM, fan, CPU power) picks the right sensor and limits. With no match, the dial shows an alert.
- [ ] A raw Sensor ID (e.g. `TCPU`) overrides the list. A wrong ID shows the "Not found" validation line in the inspector.
- [ ] Label, unit, decimals and min/max change the strip at once.

**Look**
- [ ] All five strip layouts: Value + bar, Gauge arc, Sparkline, Two sensors (split), Large value. Nothing is clipped at the strip edges, and the text is readable at arm's length.
- [ ] The zone symbol (▽ ● △ ⚠) and the trend arrow show in every layout (in split, the trend arrow is on the left half only).
- [ ] Palettes Default / Colour-blind / Custom (pickers appear only for Custom). Smooth vs Stepped. Themes Default / Dark / High contrast. Text sizes Small / Medium / Large. Every "Use global default" follows the Global defaults section.
- [ ] Hold min/max shows ↓min ↑max in the bar, arc and value layouts.
- [ ] "Preview warning colours" steps through all four zones on the strip.

**Controls**
- [ ] Rotate = Cycle: steps through the primary sensor plus cycle-list sensors 2–8 and skips empty slots. The page indicator (e.g. 2/3) is right.
- [ ] Rotate = Adjust: High / Critical / both move by the step. The primary sensor's fields update in the inspector; cycle-list sensors show a (+n) offset in the title.
- [ ] Rotate = Window (sparkline): the window changes by the window step between 10 and 120 readings, and the strip shows "N pts".
- [ ] Press, Tap and Long touch each work with every choice: Reset min/max, Next strip layout, Next sensor, Refresh now, Open AIDA64, Nothing. Open AIDA64 with no AIDA64 installed shows an alert.
- [ ] The trigger hints in the Stream Deck app update when you change these choices.

**Formula mode**
- [ ] Mode = Formula hides the sensor fields and shows the expression and inputs a–h. `max(a, b)` and `avg(a, b, c)` give the right values on the strip, and the inspector shows "= value".
- [ ] A bad expression shows the error in the inspector and on the strip. Rotate = Cycle in formula mode gives an alert.

**Alerts, behaviour, efficiency**
- [ ] Alert High/Critical: the strip flashes after two readings in the zone. The chime plays at most every 30 s and stops when the value leaves the zone (hysteresis).
- [ ] Smoothing 5 visibly steadies a noisy load sensor. An interval of 250 ms vs 5000 ms changes the update rate.
- [ ] With the value steady, the plugin log shows no feedback being sent (the strip is only updated when it changes).
- [ ] Export, then Import into another dial copies every setting. Invalid JSON shows an error.
- [ ] A dial from an earlier 1.2 build (dial0–dial3 settings) keeps its sensors and recommended limits after the update.
- [ ] Sleep/wake and unplug/replug: the dial resumes without errors.
