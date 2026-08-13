import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

// ffmpeg-static/ffprobe-static are devDependencies — present whenever `npm install`
// has run (dev, test, electron:dev) but deliberately NOT bundled into the packaged
// app (see electron/main.ts, which sets CASSETTE_FFMPEG/CASSETTE_FFPROBE to the
// extraResources copy instead). require() is used instead of a static import so
// this never gets evaluated eagerly in the packaged app, where the package isn't
// present on disk at all.
const require = createRequire(import.meta.url);

function bundledFfmpegPath(): string {
  try {
    return (require("ffmpeg-static") as string | null) ?? "ffmpeg";
  } catch {
    return "ffmpeg";
  }
}

function bundledFfprobePath(): string {
  try {
    return (require("ffprobe-static") as { path: string }).path ?? "ffprobe";
  } catch {
    return "ffprobe";
  }
}

export type Device = "auto" | "mps" | "cuda" | "cpu";

export interface Config {
  port: number;
  runsRoot: string;
  pythonVenvPath: string;
  device: Device;
  /**
   * Resolved ffmpeg/ffprobe binary. Precedence: CASSETTE_FFMPEG/CASSETTE_FFPROBE
   * env override, then the ffmpeg-static/ffprobe-static package (covers dev and
   * electron:dev — no `brew install ffmpeg` needed), then a bare PATH lookup if
   * that package can't resolve a binary for this platform. Optional only so
   * hand-built Config literals in tests can omit it and get the PATH-lookup
   * fallback in runPipeline.ts/probe.ts.
   */
  ffmpegPath?: string;
  ffprobePath?: string;
  /** True only in the packaged Electron app (electron/main.ts sets CASSETTE_PACKAGED). */
  packaged?: boolean;
  /**
   * Root of the standalone Python install bundled into the packaged app
   * (electron/main.ts sets CASSETTE_PYTHON_HOME). Only meaningful when `packaged`
   * is true — see packagedPythonBinPath. Not a venv: see the comment on
   * scripts/build-python-venv.mjs for why the packaged build skips `venv` entirely.
   */
  pythonHome?: string;
  /**
   * Bundled DeepFilterNet model dir (electron/main.ts sets CASSETTE_DEEPFILTER_MODEL_DIR),
   * passed as `--model-base-dir` when packaged so the app never calls DeepFilterNet's
   * own network-fetching maybe_download_model() at runtime.
   */
  deepFilterModelDir?: string;
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
    ffmpegPath: env.CASSETTE_FFMPEG ?? bundledFfmpegPath(),
    ffprobePath: env.CASSETTE_FFPROBE ?? bundledFfprobePath(),
    packaged: env.CASSETTE_PACKAGED === "1",
    pythonHome: env.CASSETTE_PYTHON_HOME,
    deepFilterModelDir: env.CASSETTE_DEEPFILTER_MODEL_DIR,
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

/**
 * The packaged app's bundled Python is a flat standalone install (staged by
 * scripts/build-python-venv.mjs), not a venv — there's no Scripts/bin console-script
 * layer to resolve, just the interpreter itself. runPipeline.ts invokes
 * resemble-enhance/deepFilter as `<this> -m resemble_enhance.enhancer`/`-m df.enhance`
 * instead of through a console script, since console scripts have their originating
 * machine's absolute path baked into their shebang line and can't survive being
 * copied into the app bundle at a different install location.
 */
export function packagedPythonBinPath(pythonHome: string): string {
  return process.platform === "win32"
    ? path.join(pythonHome, "python.exe")
    : path.join(pythonHome, "bin", "python3");
}
