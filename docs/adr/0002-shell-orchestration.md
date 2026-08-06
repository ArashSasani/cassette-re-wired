# ADR 0002 — Shell orchestration, no Python sidecar (yet)

Status: Accepted

## Context

Brief §6 offers two ways to drive the pipeline: spawn the CLIs as child processes,
or run a Python worker importing `resemble_enhance.enhancer.inference`. There is no
remote GPU anywhere in this project — everything runs on one personal machine.

## Decision

Spawn `ffmpeg` and `resemble_enhance` with `child_process.spawn` and read their
output. **No Python glue, and no networked service boundary** — nothing here needs
to be remoteable.

## Expiry trigger

This decision has a known end date. The CLI exposes only
`resemble_enhance <in> <out>` and `--denoise_only`. The moment we need
`chunk_seconds`, `chunks_overlap`, `nfe`, `lambd`, or `tau` (all library-only),
introduce a Python sidecar over stdio. Until then the CLI defaults are fine.

## Consequences

- Control over the enhancer is coarse. Accepted for a first pass.
- Progress from the enhancer is coarse too — it emits a tqdm-style bar, not
  machine-readable output. FFmpeg stages get true progress via `-progress pipe:1`.
  Report these two tiers honestly rather than inventing a percentage for the slow
  stage.
- Cancellation means tracking child process handles and killing them. Non-optional
  for a job that can run for tens of minutes.
- Stage argument construction should be pure functions returning argv arrays, so
  they are unit-testable without invoking FFmpeg.
