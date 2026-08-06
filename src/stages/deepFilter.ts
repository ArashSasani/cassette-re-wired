import type { Invocation } from "./resembleEnhance.js";

export interface DeepFilterOptions {
  /** Absolute path to the `deepFilter` binary inside the pinned venv (ADR 0005). */
  binPath: string;
  inputPath: string;
  outputDir: string;
}

/** Route B dedicated denoise stage. Whole-file — DeepFilterNet streams, no chunking needed. */
export function buildDeepFilterInvocation(opts: DeepFilterOptions): Invocation {
  return { command: opts.binPath, args: ["-o", opts.outputDir, opts.inputPath] };
}
