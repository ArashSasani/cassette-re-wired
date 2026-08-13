#!/usr/bin/env node
// Stages a self-contained Python 3.11 install (resemble-enhance + deepfilternet +
// CPU torch), their model weights, and ffmpeg/ffprobe, so electron-builder's
// `extraResources` can ship a FULLY standalone app — no network access, no git, no
// git-lfs, no host Python required at runtime (see
// docs/adr/0005-pinned-python-venv.md amendment).
//
// Runs ONLY as part of `npm run electron:build` (via the `predist` script) — never
// during `npm run dev` / `electron:dev`. Produces an artifact for the CURRENT host's
// platform+arch only; no cross-compilation. Requires network access, `tar`, and
// (for the resemble-enhance weight prefetch, first run only) `git` + `git-lfs` — all
// on THIS BUILD MACHINE only. None of that is required on the machine that runs the
// packaged app.
//
// Deliberately NOT a `python -m venv`: venvs bake the build machine's absolute path
// into every console-script shebang (and, via pyvenv.cfg, into the interpreter
// lookup itself). Once electron-builder copies that tree into the app bundle, the
// install location is different from where it was built, so every one of those
// baked paths points at a directory the packaged app doesn't have — this was
// caught in testing (the "enhance" stage failed with tracebacks pointing at the
// original `build-cache/venv` path even when running from the installed .app).
// Instead: install dependencies directly into a copy of the standalone interpreter
// (which python-build-standalone builds to be relocatable as a whole directory),
// and invoke it via `python3 -m resemble_enhance.enhancer` / `-m df.enhance`
// instead of through a console-script wrapper — sidestepping shebangs entirely.
//
// Windows 32-bit (ia32) is unsupported: PyTorch publishes no ia32 Windows wheels, so
// neither resemble-enhance nor deepFilter can run — this script refuses to build one.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const buildCache = path.join(repoRoot, "build-cache");
const pythonDir = path.join(buildCache, "python");
const binDir = path.join(buildCache, "bin");
const modelsDir = path.join(buildCache, "models");
const pythonCacheDir = path.join(buildCache, "python-runtime");
// Weight downloads are slow (resemble-enhance is ~1.5GB via git+git-lfs) — cached
// here across builds and re-used by copy, so only the very first build on a given
// machine pays the network cost. Re-running `rm -rf build-cache/weights-cache` is
// the deliberate way to force a fresh pull (e.g. after an upstream model update).
const weightsCacheDir = path.join(buildCache, "weights-cache");

// Pinned python-build-standalone release. Bump deliberately; re-verify the lock
// file installs cleanly against the new interpreter before bumping.
const PBS_RELEASE_TAG = "20241206";
const PBS_PYTHON_VERSION = "3.11.11";

const TRIPLES = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
};

function currentTarget() {
  const key = `${process.platform}-${process.arch}`;
  if (process.platform === "win32" && process.arch === "ia32") {
    throw new Error(
      "Windows 32-bit (ia32) is not supported: PyTorch ships no ia32 Windows wheels, " +
        "so resemble-enhance and deepFilter cannot run. Build on/for x64 instead.",
    );
  }
  const triple = TRIPLES[key];
  if (!triple) {
    throw new Error(
      `No python-build-standalone triple mapped for ${key}. Supported: ${Object.keys(TRIPLES).join(", ")}.`,
    );
  }
  return { key, triple };
}

function pbsAssetUrl(triple) {
  const filename = `cpython-${PBS_PYTHON_VERSION}+${PBS_RELEASE_TAG}-${triple}-install_only.tar.gz`;
  return `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_RELEASE_TAG}/${filename}`;
}

async function downloadFile(url, destPath) {
  console.log(`[build-python-venv] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText} (${url})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
}

function extractTarGz(tarPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync("tar", ["-xzf", tarPath, "-C", destDir], { stdio: "inherit" });
}

// Reused across builds, never mutated with pip installs — keeps re-runs cheap and
// guarantees pip installs always start from an identical, pristine interpreter.
async function ensureStandalonePython(triple) {
  const extractDir = path.join(pythonCacheDir, triple);
  const interpreterDir = path.join(extractDir, "python");
  if (fs.existsSync(interpreterDir)) {
    console.log(`[build-python-venv] reusing cached interpreter at ${interpreterDir}`);
    return interpreterDir;
  }

  const tarPath = path.join(pythonCacheDir, `${triple}.tar.gz`);
  await downloadFile(pbsAssetUrl(triple), tarPath);
  extractTarGz(tarPath, extractDir);
  return interpreterDir;
}

function stagedPythonBin() {
  return process.platform === "win32"
    ? path.join(pythonDir, "python.exe")
    : path.join(pythonDir, "bin", "python3");
}

function exeSuffix() {
  return process.platform === "win32" ? ".exe" : "";
}

function stagePython(interpreterDir) {
  if (fs.existsSync(pythonDir)) fs.rmSync(pythonDir, { recursive: true, force: true });
  console.log(`[build-python-venv] staging interpreter copy at ${pythonDir}`);
  fs.cpSync(interpreterDir, pythonDir, { recursive: true, verbatimSymlinks: true });

  const pythonBin = stagedPythonBin();
  const lockFile = path.join(repoRoot, "python-requirements", "lock.txt");
  const pipArgs = ["-m", "pip", "install", "--upgrade", "-r", lockFile];
  // Standard macOS torch wheels bundle MPS support; only Windows needs the CPU-only
  // index to avoid pulling CUDA wheels the target machine can't use without a
  // matching NVIDIA driver (see plan trade-offs).
  if (process.platform === "win32") {
    pipArgs.push("--index-url", "https://download.pytorch.org/whl/cpu");
  }

  console.log("[build-python-venv] installing pinned dependencies (this pulls torch — expect several minutes)");
  execFileSync(pythonBin, pipArgs, { stdio: "inherit" });
}

function verifyPython() {
  const pythonBin = stagedPythonBin();
  // Module invocation, not console scripts — matches exactly how electron/main.ts
  // and runPipeline.ts will invoke these at runtime once packaged.
  for (const moduleName of ["resemble_enhance.enhancer", "df.enhance"]) {
    console.log(`[build-python-venv] verifying python3 -m ${moduleName} --help`);
    execFileSync(pythonBin, ["-m", moduleName, "--help"], { stdio: "ignore" });
  }
}

/** Confirms the patched download() + bundled weights actually load, offline, with no git call. */
function verifyOfflineWeights(pythonBin) {
  console.log("[build-python-venv] verifying bundled resemble-enhance weights load without git/network");
  execFileSync(
    pythonBin,
    ["-c", "from resemble_enhance.enhancer.inference import load_enhancer; load_enhancer(None, 'cpu')"],
    { stdio: "inherit", env: { ...process.env, PATH: "/nonexistent" } },
  );
}

function sitePackagesDir() {
  return process.platform === "win32"
    ? path.join(pythonDir, "Lib", "site-packages")
    : path.join(pythonDir, "lib", "python3.11", "site-packages");
}

/**
 * resemble-enhance's own download() hardcodes a `git clone` + `git lfs pull` of
 * ~1.5GB into its own package directory on first use — a real prerequisite (git,
 * git-lfs, network) that "standalone" can't leave to the end user's machine.
 * Prefetches the weights here instead (using THIS build machine's git/git-lfs,
 * cached across builds), then rewrites download.py so the packaged app never
 * touches git at all — it just returns the path to what's already bundled.
 */
function prefetchResembleEnhanceWeights(pythonBin) {
  const cachedRepo = path.join(weightsCacheDir, "resemble-enhance-model_repo");
  const modelRepoPath = path.join(sitePackagesDir(), "resemble_enhance", "model_repo");

  if (fs.existsSync(cachedRepo)) {
    console.log("[build-python-venv] reusing cached resemble-enhance weights");
  } else {
    console.log(
      "[build-python-venv] fetching resemble-enhance model weights (one-time, ~1.5GB via git+git-lfs " +
        "on this build machine — requires git and git-lfs to be installed HERE, not on end-user machines)",
    );
    execFileSync(
      pythonBin,
      ["-c", "from resemble_enhance.enhancer.inference import load_enhancer; load_enhancer(None, 'cpu')"],
      { stdio: "inherit" },
    );
    fs.rmSync(path.join(modelRepoPath, ".git"), { recursive: true, force: true });
    fs.mkdirSync(weightsCacheDir, { recursive: true });
    fs.cpSync(modelRepoPath, cachedRepo, { recursive: true });
  }

  if (fs.existsSync(modelRepoPath)) fs.rmSync(modelRepoPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(modelRepoPath), { recursive: true });
  fs.cpSync(cachedRepo, modelRepoPath, { recursive: true });

  const downloadPyPath = path.join(sitePackagesDir(), "resemble_enhance", "enhancer", "download.py");
  fs.writeFileSync(
    downloadPyPath,
    [
      "# Patched at build time by scripts/build-python-venv.mjs — the original download()",
      "# does `git clone` + `git lfs pull`, which needs git/git-lfs on whatever machine runs",
      "# this. Weights are already bundled (prefetched at build time instead), so this just",
      "# points at them directly with no network/git dependency at runtime.",
      "from pathlib import Path",
      "",
      'REPO_DIR = Path(__file__).parent.parent / "model_repo"',
      "",
      "",
      "def download():",
      '    run_dir = REPO_DIR / "enhancer_stage2"',
      "    if not run_dir.exists():",
      "        raise RuntimeError(",
      '            f"Bundled resemble-enhance weights missing at {run_dir} — rebuild the app."',
      "        )",
      "    return run_dir",
      "",
    ].join("\n"),
  );
}

/**
 * DeepFilterNet's maybe_download_model() fetches a small (~8MB) zip over plain
 * HTTPS into a per-user cache dir (no git dependency, but still a network call on
 * first run). Prefetched here and shipped as `Resources/models/DeepFilterNet3`;
 * electron/main.ts points `--model-base-dir` at it directly, so the packaged app
 * never calls maybe_download_model() at all.
 */
function prefetchDeepFilterWeights(pythonBin) {
  const cachedModel = path.join(weightsCacheDir, "DeepFilterNet3");
  const stagedModel = path.join(modelsDir, "DeepFilterNet3");

  if (fs.existsSync(cachedModel)) {
    console.log("[build-python-venv] reusing cached DeepFilterNet weights");
  } else {
    console.log("[build-python-venv] fetching DeepFilterNet model weights (one-time, ~8MB via HTTPS)");
    execFileSync(pythonBin, ["-c", "from df.enhance import maybe_download_model; maybe_download_model()"], {
      stdio: "inherit",
    });
    const cacheDir = execFileSync(pythonBin, [
      "-c",
      "from df.enhance import get_cache_dir; print(get_cache_dir())",
    ])
      .toString()
      .trim();
    fs.mkdirSync(weightsCacheDir, { recursive: true });
    fs.cpSync(path.join(cacheDir, "DeepFilterNet3"), cachedModel, { recursive: true });
  }

  if (fs.existsSync(stagedModel)) fs.rmSync(stagedModel, { recursive: true, force: true });
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.cpSync(cachedModel, stagedModel, { recursive: true });
}

async function stageFfmpegBinaries() {
  fs.mkdirSync(binDir, { recursive: true });
  const suffix = exeSuffix();

  // ffmpeg-static exports the resolved binary path directly.
  const ffmpegSrc = (await import("ffmpeg-static")).default;
  fs.copyFileSync(ffmpegSrc, path.join(binDir, `ffmpeg${suffix}`));

  // ffprobe-static exports { path }.
  const { path: ffprobeSrc } = (await import("ffprobe-static")).default;
  fs.copyFileSync(ffprobeSrc, path.join(binDir, `ffprobe${suffix}`));

  if (process.platform !== "win32") {
    fs.chmodSync(path.join(binDir, "ffmpeg"), 0o755);
    fs.chmodSync(path.join(binDir, "ffprobe"), 0o755);
  }
}

async function main() {
  const { key, triple } = currentTarget();
  console.log(`[build-python-venv] building standalone bundle for ${key} (${triple})`);

  const interpreterDir = await ensureStandalonePython(triple);
  stagePython(interpreterDir);
  verifyPython();

  const pythonBin = stagedPythonBin();
  prefetchResembleEnhanceWeights(pythonBin);
  prefetchDeepFilterWeights(pythonBin);
  verifyOfflineWeights(pythonBin);

  await stageFfmpegBinaries();

  console.log(`[build-python-venv] done — staged under ${buildCache}`);
}

main().catch((err) => {
  console.error(`[build-python-venv] ${err.message}`);
  process.exit(1);
});
