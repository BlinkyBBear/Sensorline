// Fails if any text file is not valid UTF-8 or contains common mojibake (e.g. "â€”" for "—").
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "test", "com.rescuecraftstudio.sensorline.sdPlugin", "README.md"];
const exts = /\.(ts|js|mjs|json|html|css|md|ps1)$/;
const skip = /bin[\\/]plugin\.js$|sdpi-components\.js$/;
const mojibake = /â€[”“™˜œ\u0080-\u00bf]|â†[’\u0080-\u00bf]|Ã[\u0080-\u00bf]|Â°/;
const decoder = new TextDecoder("utf-8", { fatal: true });
let bad = 0;

function walk(path) {
  const st = statSync(path);
  if (st.isDirectory()) return readdirSync(path).forEach((n) => walk(join(path, n)));
  if (!exts.test(path) || skip.test(path)) return;
  try {
    const text = decoder.decode(readFileSync(path));
    if (mojibake.test(text)) throw new Error("mojibake");
  } catch (e) {
    bad += 1;
    console.error(`${path}: ${e.message}`);
  }
}
roots.forEach((r) => { try { walk(r); } catch {} });
if (bad) process.exit(1);
console.log("UTF-8 check passed");
