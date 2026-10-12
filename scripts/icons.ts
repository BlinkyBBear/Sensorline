/** Monochrome white (#FFFFFF) action-list icons on transparent backgrounds (Elgato guideline). 20 × 20 viewBox. */
const S = 'fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

export const MONO: Record<string, string> = {
  category: `<path d="M5 19 A10 10 0 1 1 23 19" ${S.replace("1.6", "2.2")}/><path d="M14 17 L19.5 10.5" ${S.replace("1.6", "2.2")}/><circle cx="14" cy="17" r="1.8" fill="#FFFFFF"/>`,
  gauge: `<path d="M3.5 14 A7 7 0 1 1 16.5 14" ${S}/><path d="M10 12.5 L13.5 8" ${S}/><circle cx="10" cy="12.5" r="1.3" fill="#FFFFFF"/>`,
  multi: `<rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" ${S}/><rect x="11" y="2.5" width="6.5" height="6.5" rx="1.5" ${S}/><rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" ${S}/><rect x="11" y="11" width="6.5" height="6.5" rx="1.5" ${S}/>`,
  "cpu-temp": `<path d="M8 3.5 a2 2 0 0 1 4 0 V11.5 a3.6 3.6 0 1 1 -4 0 Z" ${S}/><path d="M10 8 V14" ${S}/><path d="M14.5 5 H17 M14.5 8 H17" ${S}/>`,
  "gpu-temp": `<rect x="1.5" y="5" width="12" height="9" rx="1.5" ${S}/><circle cx="7.5" cy="9.5" r="2.4" ${S}/><path d="M16 4 a1.5 1.5 0 0 1 3 0 V11 a2.6 2.6 0 1 1 -3 0 Z" ${S}/>`,
  "cpu-load": `<rect x="5" y="5" width="10" height="10" rx="1.5" ${S}/><path d="M8 2 V5 M12 2 V5 M8 15 V18 M12 15 V18 M2 8 H5 M2 12 H5 M15 8 H18 M15 12 H18" ${S}/><path d="M7.5 12.5 L9.5 10 L11 11.5 L12.5 8" ${S}/>`,
  "gpu-load": `<rect x="2" y="5" width="16" height="10" rx="1.5" ${S}/><circle cx="7" cy="10" r="2.6" ${S}/><path d="M12 12.5 V10.5 M14.5 12.5 V8" ${S}/><path d="M4 15 V17.5" ${S}/>`,
  ram: `<rect x="2" y="6" width="16" height="8" rx="1" ${S}/><path d="M5 9 V11 M8 9 V11 M11 9 V11 M14 9 V11 M4 14 V16 M16 14 V16" ${S}/>`,
  fan: `<circle cx="10" cy="10" r="1.6" ${S}/><path d="M10 8.4 C9 4 13 2.5 14 5 C14.6 6.8 12 8 11.4 9.2 M11.6 10.8 C15.5 12.5 14.2 16.6 11.6 16 C9.8 15.5 10 12.8 9.2 11.6 M8.4 10 C5 12.5 2.5 9 4.4 7.4 C5.8 6.2 7.8 8 9 8.6" ${S}/>`,
  power: `<path d="M11.5 2 L5 11 H10 L8.5 18 L15 9 H10 Z" ${S}/>`,
  formula: `<path d="M15 4 H5 L10.5 10 L5 16 H15" ${S}/>`,
  dial: `<circle cx="10" cy="10" r="6.5" ${S}/><path d="M10 10 L10 5.5" ${S}/><path d="M2.5 17.5 A10 10 0 0 0 17.5 17.5" ${S}/>`,
};

export function monoSvg(name: string, size: number): string {
  const vb = name === "category" ? 28 : 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}">${MONO[name]}</svg>`;
}

/** Full-colour plugin / app icon. */
export function pluginIconSvg(size: number, withName = false): string {
  const arc = (r: number, from: number, to: number, cx: number, cy: number) => {
    const p = (d: number) => [cx + r * Math.cos(((d - 90) * Math.PI) / 180), cy + r * Math.sin(((d - 90) * Math.PI) / 180)];
    const [ax, ay] = p(from), [bx, by] = p(to);
    return `M ${ax!.toFixed(1)} ${ay!.toFixed(1)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${bx!.toFixed(1)} ${by!.toFixed(1)}`;
  };
  const cy = withName ? 120 : 140;
  const r = withName ? 70 : 92;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 288 288">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f7bff"/><stop offset="0.4" stop-color="#2ecc71"/><stop offset="0.72" stop-color="#f5c400"/><stop offset="1" stop-color="#ff3b30"/></linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f27"/><stop offset="1" stop-color="#0c0d10"/></linearGradient>
  </defs>
  <rect width="288" height="288" rx="${withName ? 0 : 56}" fill="url(#bg)"/>
  <path d="${arc(r, 228, 492, 144, cy)}" fill="none" stroke="#2c313a" stroke-width="${withName ? 18 : 24}" stroke-linecap="round"/>
  <path d="${arc(r, 228, 492, 144, cy)}" fill="none" stroke="url(#g)" stroke-width="${withName ? 18 : 24}" stroke-linecap="round"/>
  <path d="M144 ${cy} L ${144 + r * 0.62 * Math.cos(-0.5)} ${cy - r * 0.62 * Math.sin(1.05)}" stroke="#f4f6f8" stroke-width="${withName ? 10 : 13}" stroke-linecap="round"/>
  <circle cx="144" cy="${cy}" r="${withName ? 12 : 16}" fill="#f4f6f8"/>
  ${withName ? `<text x="144" y="250" text-anchor="middle" font-family="IBM Plex Sans" font-weight="700" font-size="44" fill="#f4f6f8">Sensorline</text>` : ""}
</svg>`;
}
