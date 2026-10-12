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
- [ ] Stream Deck +: dial rotate (cycle and adjust), press resets min/max, tap switches view, layout looks right.
- [ ] Virtual Stream Deck and Stream Deck Mobile show keys correctly.
- [ ] Sleep/wake the PC: values resume.
- [ ] Runs without administrator rights.
