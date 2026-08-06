import path from "node:path";
import type { Route, RunMode } from "../runs/types.js";

// resemble_enhance and deepFilter are folder-in/folder-out, so every stage's working
// area is a directory with a single fixed-name wav inside it. Using the same fixed
// name at every stage means each tool sees the same basename in and out, sidestepping
// the (unverified) question of what filename deepFilter gives its output.
const STAGE_AUDIO_FILENAME = "audio.wav";

export function prepDir(runDir: string): string {
  return path.join(runDir, "prep");
}

export function prepWavPath(runDir: string): string {
  return path.join(prepDir(runDir), STAGE_AUDIO_FILENAME);
}

export function deepFilterOutDir(runDir: string): string {
  return path.join(runDir, "denoised");
}

export function deepFilterOutWavPath(runDir: string): string {
  return path.join(deepFilterOutDir(runDir), STAGE_AUDIO_FILENAME);
}

/** Route A feeds the enhancer straight from prep/; Route B feeds it from DeepFilterNet's output. */
export function enhanceInputDir(runDir: string, route: Route): string {
  return route === "A" ? prepDir(runDir) : deepFilterOutDir(runDir);
}

export function enhanceOutDir(runDir: string): string {
  return path.join(runDir, "enhanced");
}

export function enhanceOutWavPath(runDir: string): string {
  return path.join(enhanceOutDir(runDir), STAGE_AUDIO_FILENAME);
}

export function finalOutputPath(runDir: string, mode: RunMode): string {
  return path.join(runDir, mode === "sample" ? "sample-final.mp3" : "final.mp3");
}
