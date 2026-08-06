import fs from "node:fs/promises";
import path from "node:path";
import type { Config } from "../config.js";
import { deepFilterBinPath, resembleEnhanceBinPath } from "../config.js";
import { runDir, sourcePath, updateManifest } from "../runs/runStore.js";
import type { Route, RunMode, SampleWindow, StageStatus } from "../runs/types.js";
import { buildDecodeArgs, routeBFilters } from "../stages/ffmpegDecode.js";
import { buildLoudnormArgs } from "../stages/loudnorm.js";
import { buildEnhanceInvocation } from "../stages/resembleEnhance.js";
import { buildDeepFilterInvocation } from "../stages/deepFilter.js";
import { FfmpegProgressTracker, fractionFromSnapshot } from "../process/ffmpegProgress.js";
import { parseTqdmPercent } from "../process/enhancerProgress.js";
import { probeDurationSeconds } from "./probe.js";
import { buildEnhanceEnv, resolveEnhanceDevice } from "./env.js";
import { runStage } from "./stageRunner.js";
import {
  prepDir,
  prepWavPath,
  deepFilterOutDir,
  deepFilterOutWavPath,
  enhanceInputDir,
  enhanceOutDir,
  enhanceOutWavPath,
  finalOutputPath,
} from "./paths.js";

/**
 * DeepFilterNet does not preserve the input's exact filename — it writes
 * `<input-stem>_DeepFilterNetN.wav` (verified: `audio.wav` -> `audio_DeepFilterNet3.wav`).
 * Every stage's working dir is otherwise a fixed-name-wav-in, fixed-name-wav-out
 * contract (paths.ts), so rename DeepFilterNet's actual output back to that fixed
 * name — otherwise the mismatch propagates: resemble-enhance preserves whatever
 * basename it's given, so it too emits the wrong name, and loudnorm then fails
 * looking for a file that was never created under the expected name.
 */
async function normalizeDeepFilterOutput(runDir: string): Promise<void> {
  const outDir = deepFilterOutDir(runDir);
  const expectedPath = deepFilterOutWavPath(runDir);
  const files = await fs.readdir(outDir);
  const produced = files.find((f) => f.endsWith(".wav"));
  if (produced && path.join(outDir, produced) !== expectedPath) {
    await fs.rename(path.join(outDir, produced), expectedPath);
  }
}

export interface RunPipelineOptions {
  route: Route;
  mode: RunMode;
  denoiseOnly: boolean;
  device: Config["device"];
  sample: SampleWindow | null;
  /** Route B only: mains hum frequency to notch out. 60 (US) unless the recording is EU. */
  mainsHz?: 50 | 60;
}

const STAGE_NAMES: Record<Route, string[]> = {
  A: ["decode", "enhance", "loudnorm"],
  B: ["decode", "denoise", "enhance", "loudnorm"],
};

function ffmpegProgressLine(totalDurationSeconds: number) {
  const tracker = new FfmpegProgressTracker();
  return (line: string): number | null => {
    const snapshot = tracker.ingestLine(line);
    if (!snapshot) return null;
    return fractionFromSnapshot(snapshot, totalDurationSeconds);
  };
}

/** Fails the run's remaining pending stages so the manifest reflects where it actually stopped. */
async function markRemainingStages(
  runsRoot: string,
  runId: string,
  status: Extract<StageStatus, "cancelled" | "failed">,
): Promise<void> {
  await updateManifest(runsRoot, runId, (m) => {
    for (const stage of m.stages) {
      if (stage.status === "pending") stage.status = status;
    }
  });
}

export async function runPipeline(
  config: Config,
  runId: string,
  options: RunPipelineOptions,
): Promise<void> {
  const runsRoot = config.runsRoot;
  const dir = runDir(runsRoot, runId);
  const startedAt = Date.now();

  const sourceDurationSeconds = await probeDurationSeconds(sourcePath(runsRoot, runId));

  // Clamp sample window to the actual source length: if the offset is past
  // the end, ffmpeg produces an empty WAV and the enhancer crashes on zero chunks.
  let sample = options.sample;
  if (sample) {
    if (sample.offsetSeconds >= sourceDurationSeconds) {
      // Source is shorter than the offset — drop the excerpt, process the whole file.
      sample = null;
    } else {
      const availableAfterOffset = sourceDurationSeconds - sample.offsetSeconds;
      if (sample.durationSeconds > availableAfterOffset) {
        sample = { ...sample, durationSeconds: availableAfterOffset };
      }
    }
  }

  await updateManifest(runsRoot, runId, (m) => {
    m.route = options.route;
    m.mode = options.mode;
    m.denoiseOnly = options.denoiseOnly;
    m.device = options.device;
    m.sample = sample;
    m.stages = STAGE_NAMES[options.route].map((name) => ({
      name,
      status: "pending",
      progress: null,
      startedAt: null,
      endedAt: null,
    }));
  });

  const audioDurationSeconds = sample?.durationSeconds ?? sourceDurationSeconds;

  await updateManifest(runsRoot, runId, (m) => {
    m.timings.audioDurationSeconds = audioDurationSeconds;
  });

  // 1. decode
  // Written to a temp path and renamed into place on success: prepWavPath is a fixed
  // name reused across every run on this runId, and `/runs/:id/sample-source-audio`
  // serves it live, so writing ffmpeg's output there directly risks the endpoint
  // streaming a torn file mid-rewrite on a rerun. Rename is atomic, so readers only
  // ever see the old complete file or the new complete file.
  const decodeSampleRate = options.route === "A" ? 44100 : 48000;
  await fs.mkdir(prepDir(dir), { recursive: true });
  // Extension stays .wav — ffmpeg infers the output muxer from it, so a bare ".tmp"
  // suffix makes ffmpeg fail to detect the format.
  const decodeTmpPath = path.join(prepDir(dir), "audio.tmp.wav");
  const decodeArgs = buildDecodeArgs({
    inputPath: sourcePath(runsRoot, runId),
    outputPath: decodeTmpPath,
    sampleRate: decodeSampleRate,
    filters: options.route === "B" ? routeBFilters(options.mainsHz ?? 60) : undefined,
    offsetSeconds: sample?.offsetSeconds,
    durationSeconds: sample?.durationSeconds,
  });

  const decodeResult = await runStage({
    runsRoot,
    runId,
    stageName: "decode",
    command: "ffmpeg",
    args: decodeArgs,
    onProgressLine: ffmpegProgressLine(audioDurationSeconds),
  });
  if (!decodeResult.ok) {
    await fs.rm(decodeTmpPath, { force: true });
    await markRemainingStages(runsRoot, runId, decodeResult.cancelled ? "cancelled" : "failed");
    return;
  }
  await fs.rename(decodeTmpPath, prepWavPath(dir));

  // 2. (Route B only) dedicated denoise
  if (options.route === "B") {
    await fs.mkdir(deepFilterOutDir(dir), { recursive: true });
    const deepFilterInvocation = buildDeepFilterInvocation({
      binPath: deepFilterBinPath(config.pythonVenvPath),
      inputPath: prepWavPath(dir),
      outputDir: deepFilterOutDir(dir),
    });
    const denoiseResult = await runStage({
      runsRoot,
      runId,
      stageName: "denoise",
      command: deepFilterInvocation.command,
      args: deepFilterInvocation.args,
    });
    if (!denoiseResult.ok) {
      await markRemainingStages(runsRoot, runId, denoiseResult.cancelled ? "cancelled" : "failed");
      return;
    }
    await normalizeDeepFilterOutput(dir);
  }

  // 3. denoise + upscale
  await fs.mkdir(enhanceOutDir(dir), { recursive: true });
  const enhanceDevice = resolveEnhanceDevice(options.device, options.denoiseOnly);
  const enhanceInvocation = buildEnhanceInvocation({
    binPath: resembleEnhanceBinPath(config.pythonVenvPath),
    inputDir: enhanceInputDir(dir, options.route),
    outputDir: enhanceOutDir(dir),
    denoiseOnly: options.denoiseOnly,
    device: enhanceDevice,
  });
  const enhanceResult = await runStage({
    runsRoot,
    runId,
    stageName: "enhance",
    command: enhanceInvocation.command,
    args: enhanceInvocation.args,
    env: buildEnhanceEnv(enhanceDevice),
    onProgressLine: (line) => parseTqdmPercent(line),
  });
  if (!enhanceResult.ok) {
    await markRemainingStages(runsRoot, runId, enhanceResult.cancelled ? "cancelled" : "failed");
    return;
  }

  // 4. loudness normalize -> final mp3 (only stage allowed to touch mp3 again)
  const finalPath = finalOutputPath(dir, options.mode);
  const loudnormArgs = buildLoudnormArgs({
    inputPath: enhanceOutWavPath(dir),
    outputPath: finalPath,
  });
  const loudnormResult = await runStage({
    runsRoot,
    runId,
    stageName: "loudnorm",
    command: "ffmpeg",
    args: loudnormArgs,
    onProgressLine: ffmpegProgressLine(audioDurationSeconds),
  });
  if (!loudnormResult.ok) {
    await markRemainingStages(runsRoot, runId, loudnormResult.cancelled ? "cancelled" : "failed");
    return;
  }

  const wallClockSeconds = (Date.now() - startedAt) / 1000;
  await updateManifest(runsRoot, runId, (m) => {
    m.finalOutputPath = finalPath;
    m.timings.wallClockSeconds = wallClockSeconds;
    m.timings.wallClockPerAudioMinute = wallClockSeconds / (audioDurationSeconds / 60);
  });
}
