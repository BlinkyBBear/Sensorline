# Reproducible build and release

## Toolchain
- Node 20.x (tested with 20.19.2). npm 10.
- Dependencies are pinned in `package-lock.json`; always use `npm ci`.

## Build
```sh
npm ci
npm run lint      # tsc + UTF-8 / mojibake check
npm test          # vitest
npm run assets    # optional: regenerates icons, key images, gallery, alert sound (needs fonts: IBM Plex Sans)
npm run pack      # esbuild bundle + `streamdeck pack` → dist/com.rescuecraftstudio.sensorline.streamDeckPlugin
```
The bundle (`bin/plugin.js`) is not committed; it is produced by `build.mjs` (esbuild, ESM, Node 20 target, `createRequire` banner, no source maps in release builds). With the same lockfile and Node major version, the bundle is byte-identical. Check with `sha256sum com.rescuecraftstudio.sensorline.sdPlugin/bin/plugin.js` on two machines.

`streamdeck pack` stores file timestamps in the zip, so the `.streamDeckPlugin` file itself is not byte-identical between builds. Compare the unpacked contents instead (`unzip -l`, or hash every file).

## Versioning
- `manifest.json` `Version` (four parts, e.g. `1.2.0.0`) and `package.json` `version` (`1.2.0`) are bumped together.
- Settings carry `schema` (3 in 1.2). `src/migrate.ts` upgrades 1.0/1.1 settings when a key appears. Action UUIDs never change.

## Code signing
Stream Deck plugins are not code-signed by the developer: Elgato distributes the `.streamDeckPlugin` from Marketplace after review. The package contains no executables. It only contains JavaScript run by Stream Deck's bundled Node and one PowerShell script.

Optional, if a code-signing certificate is available (OV or EV Authenticode, e.g. from DigiCert/Sectigo):
1. Sign the bridge before packing:
   `Set-AuthenticodeSignature .\com.rescuecraftstudio.sensorline.sdPlugin\bin\aida-bridge.ps1 -Certificate (Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert) -TimestampServer http://timestamp.digicert.com`
2. Run `npm run pack` without rebuilding the script, and confirm with `Get-AuthenticodeSignature`.
This only helps on PCs that enforce `AllSigned` through Group Policy. Sensorline starts the script with `-ExecutionPolicy Bypass` for its own process only, which needs no admin rights. No certificate is available in this repo, so this step is documented, not automated.

## Release checklist
1. `npm ci && npm run lint && npm test && npm run pack`
2. Install `dist/*.streamDeckPlugin` on a Windows PC with AIDA64 and run the hardware checklist in `docs/testing.md`.
3. Upload the package and the `marketplace/` assets in Maker Console. Paste `description.txt` and `release-notes-1.2.0.md`.
