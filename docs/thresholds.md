# Default thresholds

Picking a sensor in the Gauge inspector fills in these defaults (`src/sensors/thresholds.ts`). You can override every value.
Zones: below **Cold** = blue, up to **High** = green, from **High** = yellow, from **Critical** = red.
Neutral sensors have no zone colouring (solid colour).

| Sensor (AIDA64 IDs, matched by regex) | Min–Max | Cold / High / Critical | Basis |
|---|---|---|---|
| CPU temp (`TCPU`, `TCPUPKG`, `TCC-*`) | 20–100 °C | 30 / 70 / 85 | Intel Tjmax ≈ 100 °C; AMD Ryzen 7000 runs to 95 °C by design |
| GPU temp (`TGPU1`) | 20–100 °C | 30 / 75 / 85 | NVIDIA GPUs throttle around 83–90 °C |
| GPU hotspot / memory (`TGPU1HOT`, `TGPU1MEM`) | 20–115 °C | 35 / 90 / 105 | AMD: 110 °C junction is within spec; GDDR6X throttles near 110 °C |
| NVMe / SSD (`TNVME*`, drives labelled SSD/NVMe) | 20–90 °C | 30 / 50 / 70 | NVMe WCTEMP typically ≈ 70 °C, CCTEMP 75–85 °C |
| HDD (`THDD*`) | 15–65 °C | 25 / 45 / 55 | Seagate/WD operating range 0–60 °C |
| DIMM (`TDIMM*`) | 20–95 °C | 30 / 60 / 80 | DDR5 refresh doubles/throttling ≈ 85 °C |
| Chipset / PCH | 20–100 °C | 30 / 70 / 85 | Intel PCH Tjmax ≈ 100–104 °C |
| VRM / MOS | 20–125 °C | 30 / 80 / 100 | MOSFET Tj rating 125–150 °C |
| Coolant | 15–60 °C | 25 / 40 / 50 | Loop components rated ≈ 50–60 °C |
| Other temperatures | 20–100 °C | 30 / 75 / 90 | Generic |
| Utilisation (`*UTI`, `*ACT`) | 0–100 % | 10 / 75 / 90 | |
| GPU TDP % (`PGPU1TDPP`) | 0–100 % | 10 / 80 / 95 | |
| Duty cycle (`D*`) | 0–100 % | neutral | |
| Fan RPM (`F*`) | 0–auto | neutral | |
| Pump RPM (labels/ids containing PUMP) | 0–auto | High below 1200, Critical below 800 (inverted) | |
| CPU package power (`PCPU*`) | 0–250 W | 15 / 125 / 200 | Intel PL1/PL2, AMD PPT |
| GPU power (`PGPU*`) | 0–450 W | 30 / 360 / 428 (80 % / 95 % of a 450 W board) | Adjust to your card's TBP |
| Voltage, current, clocks | auto | neutral | |
| Network / disk throughput (`*RATE`, `*SPD`) | auto | neutral | |

These numbers are sensible starting points, not vendor guarantees. Check your own hardware's datasheet.
