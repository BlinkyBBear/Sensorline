import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Default install locations of AIDA64 Extreme. */
export const AIDA_PATHS = [
  "C:\\Program Files (x86)\\FinalWire\\AIDA64 Extreme\\aida64.exe",
  "C:\\Program Files\\FinalWire\\AIDA64 Extreme\\aida64.exe",
];

/** Starts AIDA64 (no admin rights needed; AIDA64 itself may ask for elevation). Returns false if not found. */
export function openAida64(customPath: string): boolean {
  if (process.platform !== "win32") return false;
  const exe = [customPath, ...AIDA_PATHS].find((p) => p && p.toLowerCase().endsWith(".exe") && existsSync(p));
  if (!exe) return false;
  const child = spawn(exe, [], { detached: true, stdio: "ignore", windowsHide: false });
  child.on("error", () => undefined);
  child.unref();
  return true;
}

/** Plays the bundled alert sound (generated tone, CC0). Fire and forget. */
export function playAlertSound(): void {
  const file = path.join(pluginRoot(), "sounds", "alert.wav");
  if (!existsSync(file)) return;
  let cmd: string;
  let args: string[];
  if (process.platform === "win32") {
    cmd = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    args = ["-NoProfile", "-NonInteractive", "-Command", `(New-Object Media.SoundPlayer '${file.replace(/'/g, "''")}').PlaySync()`];
  } else if (process.platform === "darwin") {
    cmd = "afplay";
    args = [file];
  } else {
    cmd = "aplay";
    args = ["-q", file];
  }
  const child = spawn(cmd, args, { stdio: "ignore", windowsHide: true });
  child.on("error", () => undefined);
}
