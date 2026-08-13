# ADR 0005 — Pin an app-owned Python virtualenv

Status: Accepted

## Context

The host's Python is **>> 3.11**. `resemble-enhance` is effectively unmaintained and
pins older torch/dependency versions(check their github for latest updates), so it is unlikely to resolve against >> 3.11 —
and the host Python will keep moving regardless.

## Decision

Create a **dedicated virtualenv on Python 3.10 or 3.11** (`uv` or `pyenv`) at a known
path, and invoke *that interpreter's* `resemble_enhance` by absolute configured path.
FFmpeg stays an ordinary PATH lookup.

## Consequences

- **Amends the original assumption** that FFmpeg and resemble-enhance are installed
  and on PATH, for the Python side only. Preflight validates the configured
  interpreter path and logs resolved versions of everything; FFmpeg is still checked
  on PATH.
- The app is insulated from host Python upgrades. Without this, the tool breaks the
  next time the system interpreter moves.
- Set `PYTORCH_ENABLE_MPS_FALLBACK=1` so unsupported ops fall back to CPU instead of
  killing a long run.
- Expose device selection (auto / mps / cuda / cpu). On Apple Silicon Macs with
  sufficient unified memory, MPS is viable for the denoise-only mode; on
  Windows/NVIDIA hosts CUDA fills the same role. The generative upscale is forced to
  CPU on both platforms to avoid saturating memory.

## Addendum — packaged builds skip the venv entirely and bundle the weights too

The pinned-Python-3.11 decision above still holds for *dev*, but packaged builds
diverge further than originally planned, for reasons discovered during testing:

- **Dev** (`npm run dev` / `electron:dev`): unchanged — the developer creates
  `~/.cassette-rewired/.venv` manually per the README, exactly as before.
- **Packaged builds** (`npm run electron:build`): NOT a venv.
  `python -m venv` bakes the build machine's absolute path into every
  console-script shebang and into `pyvenv.cfg`'s interpreter lookup — once
  electron-builder copies that tree into the app bundle, those baked paths point at
  a directory the packaged app doesn't have. This was caught in testing: the
  "enhance" stage failed with tracebacks pointing at the original `build-cache/venv`
  path even when running from the installed `.app`. `scripts/build-python-venv.mjs`
  instead installs everything directly into a real copy of the standalone
  interpreter (which python-build-standalone builds to be relocatable as a whole
  directory) and `runPipeline.ts` invokes it as `python3 -m resemble_enhance.enhancer`
  / `-m df.enhance` instead of through a console-script wrapper, sidestepping
  shebangs entirely. `electron/main.ts` sets `CASSETTE_PYTHON_HOME` (not
  `CASSETTE_PYTHON_VENV`) only when `app.isPackaged`.
- **Model weights are prefetched and patched in at build time, not fetched at
  runtime.** resemble-enhance's own `download()` does `git clone` + `git lfs pull`
  of ~680 MB directly into its own package directory on first use — a real
  git/git-lfs/network dependency that can't be left to the end user's machine if the
  app is to be genuinely standalone. This was also caught in testing: a
  Finder-launched (not terminal-launched) app gets a minimal `launchd` PATH with no
  Homebrew, so `git lfs pull` failed with "git: 'lfs' is not a git command" even
  though it worked when tested via a shell-launched `open`. Instead,
  `build-python-venv.mjs` prefetches the weights once (using the *build* machine's
  git/git-lfs, cached under `build-cache/weights-cache/` across builds) and rewrites
  `resemble_enhance/enhancer/download.py` to just return the bundled path — the
  packaged app never calls git at all. DeepFilterNet's much smaller (~8 MB) model
  comes over plain HTTPS with no git dependency, but is prefetched the same way and
  passed via `--model-base-dir` so it skips its own network-fetching
  `maybe_download_model()` too.

CPU-only torch wheels are used for the bundled install (Apple Silicon wheels include
MPS regardless), trading away CUDA acceleration on bundled Windows builds in
exchange for a much smaller, driver-independent install. Users who need CUDA can
still point `CASSETTE_PYTHON_VENV` at their own GPU-enabled venv in dev mode.

