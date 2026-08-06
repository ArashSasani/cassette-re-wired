export type FfmpegProgressSnapshot = Record<string, string>;

/**
 * Accumulates `-progress pipe:1` key=value lines into a snapshot, emitted whenever
 * a `progress=` line closes out a block (ffmpeg's own block terminator).
 */
export class FfmpegProgressTracker {
  private current: FfmpegProgressSnapshot = {};

  ingestLine(line: string): FfmpegProgressSnapshot | null {
    const trimmed = line.trim();
    const idx = trimmed.indexOf("=");
    if (idx === -1) return null;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    this.current[key] = value;

    if (key === "progress") {
      const snapshot = this.current;
      this.current = {};
      return snapshot;
    }
    return null;
  }
}

/** Fraction complete in [0, 1], or null if the snapshot lacks enough info to tell. */
export function fractionFromSnapshot(
  snapshot: FfmpegProgressSnapshot,
  totalDurationSeconds: number,
): number | null {
  if (snapshot.progress === "end") return 1;

  const outTimeUs = Number(snapshot.out_time_us);
  if (!Number.isFinite(outTimeUs) || totalDurationSeconds <= 0) return null;

  const fraction = outTimeUs / 1_000_000 / totalDurationSeconds;
  return Math.min(Math.max(fraction, 0), 1);
}
