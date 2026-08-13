# ADR 0003 — The filesystem is the run state

Status: Accepted

## Context

A run has stages, intermediate artifacts, and source metadata worth keeping. A
per-file source record is needed, and resumable full runs are a nice-to-have.

## Decision

**One directory per run**, app-owned:

```
~/.cassette-rewired/runs/<id>/
  manifest.json             stage status, timings, options used
  source.mp3                copy of the input; the original is never touched
  prep/audio.wav            decoded excerpt (sample) or full file — wav throughout
  denoised/audio.wav        Route B only: DeepFilterNet output
  enhanced/audio.wav        resemble-enhance output
  sample-final.mp3 | final.mp3
  previews/                 see ADR 0004
```

No database, no ORM.

## Consequences

- Four things fall out nearly free: the source record, inspectability
  when a result sounds wrong, the hook for resumability, and benchmark data.
- **Record wall-clock per audio-minute in the manifest.** With no bigger machine to
  escalate to, extrapolating from the 3-minute sample is the only way to know what a
  90-minute run costs before starting it. This makes sample mode a benchmark as well
  as an audition.
- An app-owned directory, not OS temp, which gets swept out from under long runs.
- The manifest is adopted now; **segment-level resume is deferred** until a full run
  actually fails. Cheap hook now, real complexity later, only if earned.
- Needs a retention/cleanup story — runs hold hundreds of MB of wav each.
