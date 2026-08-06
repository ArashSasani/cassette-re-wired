import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { deepFilterBinPath, pythonBinPath, resembleEnhanceBinPath, type Config } from "./config.js";

const execFileAsync = promisify(execFile);

export interface CheckResult {
  name: string;
  ok: boolean;
  version?: string;
  error?: string;
}

async function checkFfmpeg(): Promise<CheckResult> {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"]);
    return { name: "ffmpeg", ok: true, version: stdout.split("\n")[0] };
  } catch (err) {
    return { name: "ffmpeg", ok: false, error: `ffmpeg not found on PATH: ${(err as Error).message}` };
  }
}

async function checkPythonVenv(venvPath: string): Promise<CheckResult> {
  const pythonBin = pythonBinPath(venvPath);
  try {
    await fs.access(pythonBin, fs.constants.X_OK);
  } catch {
    return {
      name: "python-venv",
      ok: false,
      error: `configured Python interpreter not found or not executable: ${pythonBin}`,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(pythonBin, ["--version"]);
    return { name: "python-venv", ok: true, version: (stdout || stderr).trim() };
  } catch (err) {
    return { name: "python-venv", ok: false, error: `failed to run ${pythonBin}: ${(err as Error).message}` };
  }
}

async function checkResembleEnhance(venvPath: string): Promise<CheckResult> {
  const binPath = resembleEnhanceBinPath(venvPath);
  try {
    await fs.access(binPath, fs.constants.X_OK);
    return { name: "resemble_enhance", ok: true, version: binPath };
  } catch {
    return {
      name: "resemble_enhance",
      ok: false,
      error: `resemble_enhance binary not found in venv: ${binPath}`,
    };
  }
}

async function checkDeepFilter(venvPath: string): Promise<CheckResult> {
  // Same pinned venv as resemble-enhance (ADR 0005) — deepFilter is a console script
  // installed there, not on the system PATH, so it's resolved the same way.
  const binPath = deepFilterBinPath(venvPath);
  try {
    await fs.access(binPath, fs.constants.X_OK);
  } catch {
    return {
      name: "deepFilter",
      ok: false,
      error: `deepFilter binary not found in venv: ${binPath} (run: uv pip install --python ${pythonBinPath(venvPath)} deepfilternet)`,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(binPath, ["--version"]);
    return { name: "deepFilter", ok: true, version: (stdout || stderr).trim() };
  } catch (err) {
    return { name: "deepFilter", ok: false, error: `failed to run ${binPath}: ${(err as Error).message}` };
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
  const checks = await Promise.all([
    checkFfmpeg(),
    checkPythonVenv(config.pythonVenvPath),
    checkResembleEnhance(config.pythonVenvPath),
    ...(opts.needsDeepFilter ? [checkDeepFilter(config.pythonVenvPath)] : []),
  ]);

  return { ok: checks.every((c) => c.ok), checks };
}
