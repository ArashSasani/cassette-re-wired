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

