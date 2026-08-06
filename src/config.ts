import path from "node:path";
import os from "node:os";

export type Device = "auto" | "mps" | "cuda" | "cpu";

export interface Config {
  port: number;
  runsRoot: string;
  pythonVenvPath: string;
  device: Device;
}

function resolveDevice(value: string | undefined): Device {
  if (value === "mps" || value === "cuda" || value === "cpu" || value === "auto") return value;
  return "auto";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const runsRoot =
    env.CASSETTE_RUNS_ROOT ?? path.join(os.homedir(), ".cassette-rewired", "runs");

  const pythonVenvPath =
    env.CASSETTE_PYTHON_VENV ?? path.join(os.homedir(), ".cassette-rewired", ".venv");

  return {
    port: env.PORT ? Number(env.PORT) : 4310,
    runsRoot,
    pythonVenvPath,
    device: resolveDevice(env.CASSETTE_DEVICE),
  };
}

// Windows venvs put console scripts in Scripts/ with a .exe suffix; POSIX venvs
// use bin/ with no suffix.
const VENV_BIN_DIR = process.platform === "win32" ? "Scripts" : "bin";
const EXE_SUFFIX = process.platform === "win32" ? ".exe" : "";

export function pythonBinPath(venvPath: string): string {
  return path.join(venvPath, VENV_BIN_DIR, `python${EXE_SUFFIX}`);
}

export function resembleEnhanceBinPath(venvPath: string): string {
  // The PyPI package installs a console script named with a hyphen, not the
  // `resemble_enhance` module name — verified against a real `uv pip install`.
  return path.join(venvPath, VENV_BIN_DIR, `resemble-enhance${EXE_SUFFIX}`);
}

export function deepFilterBinPath(venvPath: string): string {
  // Same pinned venv as resemble-enhance (ADR 0005) — the `deepfilternet` PyPI
  // package installs this console script into it, not onto the system PATH.
  return path.join(venvPath, VENV_BIN_DIR, `deepFilter${EXE_SUFFIX}`);
}
