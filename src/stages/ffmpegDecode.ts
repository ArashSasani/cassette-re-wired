export interface DecodeOptions {
  inputPath: string;
  outputPath: string;
  sampleRate: 44100 | 48000;
  /** Extra `-af` filters applied at decode time, e.g. rumble/hum stripping for Route B. */
  filters?: string[];
  /** Sample-mode excerpt, seconds. Omit both for a full-file run. */
  offsetSeconds?: number;
  durationSeconds?: number;
}

/**
 * Route A/B shared decode step: MP3 (or any source) -> mono wav at a given rate,
 * optionally clipped to an excerpt. `-ss` before `-i` for fast+accurate input seeking;
 * `-t` after `-i` then counts from that seek point.
 */
export function buildDecodeArgs(opts: DecodeOptions): string[] {
  const args: string[] = ["-y"];

  if (opts.offsetSeconds !== undefined) {
    args.push("-ss", String(opts.offsetSeconds));
  }

  args.push("-i", opts.inputPath);

  if (opts.durationSeconds !== undefined) {
    args.push("-t", String(opts.durationSeconds));
  }

  args.push("-ac", "1", "-ar", String(opts.sampleRate));

  if (opts.filters && opts.filters.length > 0) {
    args.push("-af", opts.filters.join(","));
  }

  args.push("-progress", "pipe:1", "-nostats", opts.outputPath);

  return args;
}

/** Route B prep filters: rumble highpass + mains-hum notch. `mainsHz` is 50 (EU) or 60 (US). */
export function routeBFilters(mainsHz: 50 | 60): string[] {
  return ["highpass=f=80", `bandreject=f=${mainsHz}:width_type=q:w=30`];
}
