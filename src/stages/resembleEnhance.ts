export interface EnhanceOptions {
  /** Absolute path to the `resemble-enhance` binary inside the pinned venv (ADR 0005). */
  binPath: string;
  inputDir: string;
  outputDir: string;
  denoiseOnly?: boolean;
  /**
   * A torch device string ("mps"/"cpu"). Required — the CLI's own default is "cuda",
   * which doesn't exist on this hardware, so we always pass this explicitly.
   */
  device: string;
}

export interface Invocation {
  command: string;
  args: string[];
}

/**
 * Folder-in/folder-out denoise+upscale. The CLI is deliberately coarse (ADR 0002) —
 * only `<in> <out>`, `--denoise_only`, and `--device` are exposed. Anything finer means
 * a Python sidecar, not more flags here.
 */
export function buildEnhanceInvocation(opts: EnhanceOptions): Invocation {
  const args = [opts.inputDir, opts.outputDir, "--device", opts.device];
  if (opts.denoiseOnly) {
    args.push("--denoise_only");
  }
  return { command: opts.binPath, args };
}
