import { build } from "esbuild";

const watch = process.argv.includes("--watch");
const options = {
  entryPoints: ["src/plugin.ts"],
  outfile: "com.rescuecraftstudio.sensorline.sdPlugin/bin/plugin.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: watch ? "inline" : false,
  charset: "utf8",
  logLevel: "info",
  // ws (used by the SDK) is CommonJS and calls require("events") etc. In an ESM
  // bundle esbuild's shim throws 'Dynamic require of "events" is not supported',
  // so provide a real require.
  banner: { js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);" },
};

if (watch) {
  const { context } = await import("esbuild");
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
