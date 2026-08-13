import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import {
  deepFilterBinPath,
  packagedPythonBinPath,
  pythonBinPath,
  resembleEnhanceBinPath,
  type Config,
} from "./config.js";

const execFileAsync = promisify(execFile);

export interface CheckResult {
  name: string;
  ok: boolean;
  version?: string;
  error?: string;
}

// config.packaged (set only by the packaged Electron app, electron/main.ts) means a
// failure here implies a corrupted install, not a missing prerequisite. In dev,
// ffmpeg/ffprobe come from the ffmpeg-static/ffprobe-static devDependencies — a
// failure there almost always means `npm install` hasn't run.
function notFoundHint(bundled: boolean): string {
  return bundled
    ? "reinstall the app — the bundled binary is missing or corrupted"
    : "run `npm install` (or set CASSETTE_FFMPEG/CASSETTE_FFPROBE to a system install)";
}

async function checkFfmpeg(ffmpegPath = "ffmpeg", bundled = false): Promise<CheckResult> {
  try {
    const { stdout } = await execFileAsync(ffmpegPath, ["-version"]);
    return { name: "ffmpeg", ok: true, version: stdout.split("\n")[0] };
  } catch (err) {
    return {
      name: "ffmpeg",
      ok: false,
      error: `ffmpeg not found at ${ffmpegPath}: ${(err as Error).message} — ${notFoundHint(bundled)}`,
    };
  }
}

async function checkFfprobe(ffprobePath = "ffprobe", bundled = false): Promise<CheckResult> {
  try {
    const { stdout, stderr } = await execFileAsync(ffprobePath, ["-version"]);
    return { name: "ffprobe", ok: true, version: (stdout || stderr).split("\n")[0] };
  } catch (err) {
    return {
      name: "ffprobe",
      ok: false,
      error: `ffprobe not found at ${ffprobePath}: ${(err as Error).message} — ${notFoundHint(bundled)}`,
    };
  }
}

async function checkPythonVenv(venvPath: string, bundled: boolean): Promise<CheckResult> {
  const pythonBin = pythonBinPath(venvPath);
  try {
    await fs.access(pythonBin, fs.constants.X_OK);
  } catch {
    return {
      name: "python-venv",
      ok: false,
      error: `configured Python interpreter not found or not executable: ${pythonBin} — ${notFoundHint(bundled)}`,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(pythonBin, ["--version"]);
    return { name: "python-venv", ok: true, version: (stdout || stderr).trim() };
  } catch (err) {
    return { name: "python-venv", ok: false, error: `failed to run ${pythonBin}: ${(err as Error).message}` };
  }
}

async function checkResembleEnhance(venvPath: string, bundled: boolean): Promise<CheckResult> {
  const binPath = resembleEnhanceBinPath(venvPath);
  try {
    await fs.access(binPath, fs.constants.X_OK);
    return { name: "resemble_enhance", ok: true, version: binPath };
  } catch {
    return {
      name: "resemble_enhance",
      ok: false,
      error: `resemble_enhance binary not found in venv: ${binPath} — ${notFoundHint(bundled)}`,
    };
  }
}

async function checkDeepFilter(venvPath: string, bundled: boolean): Promise<CheckResult> {
  // Same pinned venv as resemble-enhance (ADR 0005) — deepFilter is a console script
  // installed there, not on the system PATH, so it's resolved the same way.
  const binPath = deepFilterBinPath(venvPath);
  try {
    await fs.access(binPath, fs.constants.X_OK);
  } catch {
    const hint = bundled
      ? notFoundHint(true)
      : `run: uv pip install --python ${pythonBinPath(venvPath)} deepfilternet`;
    return {
      name: "deepFilter",
      ok: false,
      error: `deepFilter binary not found in venv: ${binPath} (${hint})`,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(binPath, ["--version"]);
    return { name: "deepFilter", ok: true, version: (stdout || stderr).trim() };
  } catch (err) {
    return { name: "deepFilter", ok: false, error: `failed to run ${binPath}: ${(err as Error).message}` };
  }
}

// Packaged builds bundle a flat standalone Python install, not a venv (see
// scripts/build-python-venv.mjs) — there's no console-script layer to check for
// existence, so "is it there" instead means "does `python3 -m <module>` import
// cleanly". Uses the same CheckResult names ("python-venv", "resemble_enhance",
// "deepFilter") as the dev checks below so the UI doesn't need to branch on mode.
async function checkPackagedPython(pythonHome: string): Promise<CheckResult> {
  const pythonBin = packagedPythonBinPath(pythonHome);
  try {
    await fs.access(pythonBin, fs.constants.X_OK);
  } catch {
    return {
      name: "python-venv",
      ok: false,
      error: `bundled Python not found or not executable: ${pythonBin} — ${notFoundHint(true)}`,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(pythonBin, ["--version"]);
    return { name: "python-venv", ok: true, version: (stdout || stderr).trim() };
  } catch (err) {
    return { name: "python-venv", ok: false, error: `failed to run ${pythonBin}: ${(err as Error).message}` };
  }
}

async function checkPackagedModule(
  pythonHome: string,
  moduleName: string,
  resultName: string,
): Promise<CheckResult> {
  const pythonBin = packagedPythonBinPath(pythonHome);
  try {
    await execFileAsync(pythonBin, ["-c", `import ${moduleName}`]);
    return { name: resultName, ok: true, version: `${moduleName} (bundled)` };
  } catch (err) {
    return {
      name: resultName,
      ok: false,
      error: `${moduleName} not importable from bundled Python: ${(err as Error).message} — ${notFoundHint(true)}`,
    };
  }
}

export interface PreflightOptions {
  /** Route B needs DeepFilterNet; skip that check when only Route A is in play. */
  needsDeepFilter?: boolean;
}

export interface PreflightReport {
  ok: boolean;
  checks: CheckResult[];
}

/** Run at startup and again before each run (ADR 0005) — never attempt to install anything. */
export async function runPreflight(config: Config, opts: PreflightOptions = {}): Promise<PreflightReport> {
  const bundled = Boolean(config.packaged);

  const pythonChecks =
    bundled && config.pythonHome
      ? [
          checkPackagedPython(config.pythonHome),
          checkPackagedModule(config.pythonHome, "resemble_enhance", "resemble_enhance"),
          ...(opts.needsDeepFilter ? [checkPackagedModule(config.pythonHome, "df", "deepFilter")] : []),
        ]
      : [
          checkPythonVenv(config.pythonVenvPath, bundled),
          checkResembleEnhance(config.pythonVenvPath, bundled),
          ...(opts.needsDeepFilter ? [checkDeepFilter(config.pythonVenvPath, bundled)] : []),
        ];

  const checks = await Promise.all([
    checkFfmpeg(config.ffmpegPath, bundled),
    checkFfprobe(config.ffprobePath, bundled),
    ...pythonChecks,
  ]);

  return { ok: checks.every((c) => c.ok), checks };
}
