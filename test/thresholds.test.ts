import { describe, expect, it } from "vitest";
import { recommend } from "../src/sensors/thresholds.js";
import { parseAidaXml } from "../src/sensors/parse.js";
import type { Sensor, SensorType } from "../src/sensors/types.js";
import { applyRecommendation, defaultGauge, parseGauge } from "../src/settings.js";

function s(id: string, type: SensorType, unit: string, label = id, numeric: number | null = 40): Sensor {
  return { key: id, id, label, raw: String(numeric), type, numeric, unit };
}

describe("recommend: per-sensor defaults by ID", () => {
  const cases: [Sensor, string, number, number, number | null, number | null, number | null][] = [
    // sensor, rule, min, max, cold, warn, crit
    [s("TCPU", "temp", "°C", "CPU"), "cpu-temp", 20, 100, 30, 70, 85],
    [s("TCPUPKG", "temp", "°C", "CPU Package"), "cpu-temp", 20, 100, 30, 70, 85],
    [s("TCC-1-1", "temp", "°C", "CPU #1 / Core #1"), "cpu-temp", 20, 100, 30, 70, 85],
    [s("TGPU1", "temp", "°C", "GPU Diode"), "gpu-temp", 20, 100, 30, 75, 85],
    [s("TGPU1HOT", "temp", "°C", "GPU Hotspot"), "gpu-hotspot", 20, 115, 35, 90, 105],
    [s("TGPU1MEM", "temp", "°C", "GPU Memory"), "gpu-hotspot", 20, 115, 35, 90, 105],
    [s("THDD1", "temp", "°C", "Samsung SSD 990 PRO 2TB"), "nvme-temp", 20, 90, 30, 50, 70],
    [s("TNVME1", "temp", "°C", "Drive"), "nvme-temp", 20, 90, 30, 50, 70],
    [s("THDD2", "temp", "°C", "WDC WD40EFRX"), "hdd-temp", 15, 65, 25, 45, 55],
    [s("TDIMM1", "temp", "°C", "DIMM1"), "dimm-temp", 20, 95, 30, 60, 80],
    [s("TCHIP", "temp", "°C", "Chipset"), "chipset-temp", 20, 100, 30, 70, 85],
    [s("TPCH", "temp", "°C", "PCH Diode"), "chipset-temp", 20, 100, 30, 70, 85],
    [s("TVRM", "temp", "°C", "VRM"), "vrm-temp", 20, 125, 30, 80, 100],
    [s("TMOS", "temp", "°C", "MOS"), "vrm-temp", 20, 125, 30, 80, 100],
    [s("TCOOLANT", "temp", "°C", "Coolant"), "coolant-temp", 15, 60, 25, 40, 50],
    [s("TMOBO", "temp", "°C", "Motherboard"), "temp", 20, 100, 30, 75, 90],
    [s("SCPUUTI", "sys", "%", "CPU Utilization"), "utilisation", 0, 100, 10, 75, 90],
    [s("SMEMUTI", "sys", "%", "Memory Utilization"), "utilisation", 0, 100, 10, 75, 90],
    [s("SGPU1UTI", "sys", "%", "GPU Utilization"), "utilisation", 0, 100, 10, 75, 90],
    [s("SDSK1ACT", "sys", "%", "Disk Activity"), "utilisation", 0, 100, 10, 75, 90],
    [s("PCPUPKG", "pwr", "W", "CPU Package"), "cpu-power", 0, 250, 15, 125, 200],
    [s("PGPU1", "pwr", "W", "GPU"), "gpu-power", 0, 450, 30, 360, 428],
    [s("PGPU1TDPP", "pwr", "%", "GPU TDP%"), "gpu-tdp-percent", 0, 100, 10, 80, 95],
    [s("VCPU", "volt", "V", "CPU Core", 1.2), "voltage", 0, 100, null, null, null],
    [s("DCPU", "duty", "%", "CPU Fan"), "duty", 0, 100, null, null, null],
    [s("FCPU", "fan", "RPM", "CPU Fan", 1200), "fan-rpm", 0, 2000, null, null, null],
    [s("FPUMP", "fan", "RPM", "Pump", 2400), "pump-rpm", 0, 4000, null, 1200, 800],
  ];
  it.each(cases)("%o", (sensor, rule, min, max, cold, warn, crit) => {
    const r = recommend(sensor);
    expect({ rule: r.rule, min: r.min, max: r.max, cold: r.cold, warn: r.warn, crit: r.crit }).toEqual({ rule, min, max, cold, warn, crit });
  });

  it("network throughput is neutral", () => {
    const r = recommend(s("SNIC1DLRATE", "sys", "KB/s", "NIC1 Download Rate", 1200));
    expect(r.rule).toBe("throughput");
    expect(r.warn).toBeNull();
    expect(r.crit).toBeNull();
  });

  it("backend hints override the rules", () => {
    const r = recommend({ ...s("k10temp.Tctl.temp1_input", "temp", "°C"), hint: { warn: 60, crit: 95 } });
    expect(r.warn).toBe(60);
    expect(r.crit).toBe(95);
  });
});

describe("applyRecommendation", () => {
  it("fills thresholds and keeps colour and display choices", () => {
    const prev = { ...defaultGauge("TCPU"), palette: "custom" as const, colCold: "#112233", gradient: "stepped" as const, background: "steady" as const, intervalMs: 500 };
    const next = applyRecommendation(s("TGPU1HOT", "temp", "°C", "GPU Hotspot"), prev);
    expect(next).toMatchObject({ sensorKey: "TGPU1HOT", min: 20, max: 115, cold: 35, warn: 90, crit: 105, colorMode: "threshold" });
    expect(next).toMatchObject({ palette: "custom", colCold: "#112233", gradient: "stepped", background: "steady", intervalMs: 500 });
  });
  it("neutral sensors get the solid colour mode", () => {
    expect(applyRecommendation(s("VCPU", "volt", "V", "CPU Core", 1.2), defaultGauge()).colorMode).toBe("solid");
  });
});

describe("settings parsing", () => {
  it("defaults colours and sanitises bad values", () => {
    const g = parseGauge({ palette: "nope", gradient: "x", colCrit: "red", cold: "", warn: "80" });
    expect(g).toMatchObject({ palette: "default", gradient: "smooth", colCrit: "#ff3b30", cold: null, warn: 80 });
  });
});

describe("AIDA64 XML parsing", () => {
  it("reads shared-memory tags and types", () => {
    const xml = "<sys><id>SCPUUTI</id><label>CPU Utilization</label><value>12</value></sys><temp><id>TCPU</id><label>CPU</label><value>45</value></temp><fan><id>FCPU</id><label>CPU</label><value>1100</value></fan><pwr><id>PCPUPKG</id><label>CPU Package</label><value>35.12</value></pwr>";
    const list = parseAidaXml(xml);
    expect(list.map((x) => [x.id, x.type, x.numeric])).toEqual([
      ["SCPUUTI", "sys", 12],
      ["TCPU", "temp", 45],
      ["FCPU", "fan", 1100],
      ["PCPUPKG", "pwr", 35.12],
    ]);
  });
});
