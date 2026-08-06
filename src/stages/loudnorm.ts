export interface LoudnormOptions {
  inputPath: string;
  outputPath: string;
  integratedLoudness?: number; // I
  truePeak?: number; // TP
  loudnessRange?: number; // LRA
}

/** Final export step: wav -> loudness-normalized mp3. Only stage allowed to emit mp3. */
export function buildLoudnormArgs(opts: LoudnormOptions): string[] {
  const I = opts.integratedLoudness ?? -16;
  const TP = opts.truePeak ?? -1.5;
  const LRA = opts.loudnessRange ?? 11;

  return [
    "-y",
    "-i",
    opts.inputPath,
    "-af",
    `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}`,
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "2",
    "-progress",
    "pipe:1",
    "-nostats",
    opts.outputPath,
  ];
}
