# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**Backend, Vite-built renderer, and an Electron wrapper all in place.** Node/TS +
Express server implementing Route A/B pipeline orchestration, stage argv builders,
filesystem run state, and preflight checks, exposed as a JSON API. The frontend
(`src/renderer/`) covers the in-scope flow (see "Scope discipline" below): upload,
sample/full run with route + device + denoise-only options, stage progress polling,
and before/after `<audio>` players with synced transport. It's plain TypeScript ES
modules (no framework) built by Vite. `electron/main.ts` wraps the same server in a
native window for the packaged macOS/Windows app — see
[ADR 0001](docs/adr/0001-local-web-app-with-electron-shell.md).

```bash
npm install
npm run dev             # tsx watch src/index.ts + vite dev server (HMR), http://127.0.0.1:4310
npm run build            # tsc (backend + electron) + vite build -> dist/
npm test                 # find src -name '*.test.ts' | xargs node --import tsx --test
npm run typecheck        # tsc --noEmit for both the Node backend and the DOM renderer
npm run electron:dev      # build, then launch the Electron window
npm run electron:build    # electron-builder: dmg (macOS) + nsis (Windows)
```

Single test file: `node --import tsx --test src/pipeline/runPipeline.test.ts`.

Config is env-driven (`src/config.ts`): `PORT`, `CASSETTE_RUNS_ROOT`,
`CASSETTE_PYTHON_VENV`, `CASSETTE_DEVICE` (`auto`/`mps`/`cuda`/`cpu`). Python venv
executable paths are platform-aware — `bin/` on POSIX, `Scripts/` with `.exe` on
Windows.

API surface (`src/server.ts`): `GET /preflight`, `POST /runs` (multipart `source`
field), `GET /runs/:id`, `GET /runs/:id/source-audio`,
`GET /runs/:id/sample-source-audio`, `GET /runs/:id/output-audio`,
`POST /runs/:id/sample`, `POST /runs/:id/full`, `POST /runs/:id/cancel`. Static
assets are the Vite-built renderer bundle (`dist/renderer/`, built from
`src/renderer/`), served at `/`.

Renderer layout (`src/renderer/`): `main.ts` is the entry point; `api/client.ts`
wraps `fetch()` calls; `state/run-state.ts` tracks the current run id/mode;
`ui/` holds one module per DOM concern (`upload.ts`, `pipeline.ts`, `player.ts`,
`vu-meter.ts`, `cassette.ts`, `segmented.ts`). Typechecked separately via
`tsconfig.renderer.json` (DOM lib) since the backend's `tsconfig.json` targets Node
and excludes `src/renderer`.

Read before starting work:

- `README.md` — what it is, prerequisites, pipeline, scope
- `docs/adr/0001`–`0005` — the five architectural decisions and what was rejected

## Decisions already made (do not relitigate)

Local web app on `127.0.0.1`, wrapped by Electron for a double-clickable macOS +
Windows build — no IPC split, the renderer still talks to the same Express JSON API
over `fetch()` (ADR 0001). Shell out to `ffmpeg`/`resemble_enhance` via
`child_process.spawn`, no Python sidecar and no networked service (ADR 0002). One
directory per run under `~/.cassette-rewired/runs/<id>/`, no database (ADR 0003).
Preview encodes are a dead-end branch, never a stage input (ADR 0004). Python runs
from an app-owned pinned 3.10/3.11 virtualenv invoked by absolute path (ADR 0005).

## Hard constraints (correctness, not preference)

- **Decode once, stay lossless in the middle.** wav for every intermediate stage; MP3
  only at final export. Each round-trip stacks fresh loss.
- **Never hand-roll fixed audio cuts for the enhancer.** Let it chunk internally;
  naive cuts produce audible seams at every boundary. Chunking bounds peak VRAM, it
  does not reduce total compute — don't present it as a speed optimisation.
- **Do not assume one sample rate across stages.** DeepFilterNet takes 48kHz in;
  resemble-enhance emits 44.1kHz. Carry rate explicitly per stage.
- **The upscale is generative** — it invents plausible detail rather than recovering
  discarded data. Its output must always be auditionable, never silently trusted.
- Fine enhancer knobs (`chunk_seconds`, `chunks_overlap`, `nfe`, `lambd`, `tau`) are
  **library-only**. The CLI exposes just `resemble_enhance <in> <out>` and
  `--denoise_only`. Needing any of them is the trigger to revisit ADR 0002 — but see
  `docs/experiments/lambd-tuning/`: `lambd` was already tested directly against the
  library and didn't fix speech quality, so the sidecar hasn't been built.

## Implementation notes

These aren't ADR-weight but are easy to get wrong:

- **Two-tier progress, honestly reported.** FFmpeg stages get true percentages via
  `-progress pipe:1` (key=value lines including `out_time_us`). The enhancer emits a
  tqdm-style bar — coarse at best; verify what it actually prints before designing
  around it. A fabricated percentage on the 40-minute stage is worse than an
  indeterminate indicator.
- **Sample the excerpt from an offset, not 0:00.** The first minute of a lecture is
  intro, shuffling and room tone — a poor test of denoise and a worse test of the
  upscale, which is judged on speech. Default around `-ss 60 -t 180`, offset exposed.
- **Record wall-clock per audio-minute in the manifest.** There is no bigger machine
  to escalate to, so extrapolating from the sample is the only way to know the cost of
  a 90-minute run before starting it.
- **Denoise-only is a first-class mode**, not an error path — and now the **default**
  in both the UI checkbox and the server's fallback. The generative upscale produces
  defective speech on lecture recordings (see
  `docs/experiments/lambd-tuning/README.md`); denoise-only is what actually sounds
  right on this material. The generative upscale stays available, opt-in.
- **Test the argv builders, not FFmpeg.** Each stage should be a pure function from
  options to an argument array; unit-test those, and keep the subprocess layer to one
  thin smoke test. Do not build a fixture-heavy audio integration harness.
- **Cancellation is required.** Track child process handles and kill them; runs last
  tens of minutes.
- **Preflight twice** — at startup and before each run. Validate the configured Python
  interpreter path and FFmpeg on PATH, and log resolved versions. Surface a clear
  error; never attempt to install anything.
- Set `PYTORCH_ENABLE_MPS_FALLBACK=1`; expose device selection (auto/mps/cuda/cpu).
  `mps` is Apple-Silicon-only; `cuda` is the Windows/NVIDIA equivalent. Developed on
  Apple Silicon (macOS), packaged for macOS + Windows (ADR 0001).

## Scope discipline

**In:** input picker, sample mode via FFmpeg `-ss`/`-t`, Route A, before/after playback
(two players, shared transport position), progress, export, DeepFilterNet toggle.
Later: `ffprobe` source logging, `showspectrumpic` spectrogram thumbnails, resumable
full runs via segment manifest.

**Out:** cloud, accounts, multi-user, DAW-style editing. Prefer simplicity over
features — personal testing tool, not a product.

