# ADR 0004 — Preview artifacts are quarantined from the export chain

Status: Accepted

## Context

Intermediate stages stay wav (decode once and stay lossless). Mono
44.1kHz/16-bit is roughly **5MB per audio-minute**, so a 90-minute intermediate is
~475MB. Streaming that into two `<audio>` elements for A/B is impractical, so
compressed preview copies are needed.

That creates an obvious trap: reaching for the small compressed file as a stage
input "because it's already there" silently breaks the lossless rule.

## Decision

Previews are a **dead-end branch**. They are generated *from* pipeline artifacts into
`previews/`, and are never an input to any later stage. Export always reads the wav
chain.

## Consequences

- The decode-once rule is protected structurally rather than by discipline. This is
  the failure mode most likely to appear later disguised as a performance fix.
- One extra encode per audition. Negligible next to the enhancer.
- Preview files are disposable and can be deleted without affecting a run's validity.
