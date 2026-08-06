export function buildDurationProbeArgs(inputPath: string): string[] {
  return ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", inputPath];
}

export function parseDurationOutput(stdout: string): number {
  const value = Number(stdout.trim());
  if (!Number.isFinite(value)) {
    throw new Error(`could not parse ffprobe duration output: ${JSON.stringify(stdout)}`);
  }
  return value;
}
