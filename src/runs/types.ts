import type { Device } from "../config.js";

export type Route = "A" | "B";
export type RunMode = "sample" | "full";
export type StageStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface StageRecord {
  name: string;
  status: StageStatus;
  /** 0..1, or null when the stage's progress is indeterminate (e.g. the enhancer). */
  progress: number | null;
  startedAt: string | null;
  endedAt: string | null;
  error?: string;
}

export interface SampleWindow {
  offsetSeconds: number;
  durationSeconds: number;
}

export interface RunTimings {
  audioDurationSeconds: number | null;
  wallClockSeconds: number | null;
  /** The only way to estimate a 90-minute run's cost before starting it (ADR 0003). */
  wallClockPerAudioMinute: number | null;
}

export interface RunManifest {
  id: string;
  createdAt: string;
  sourceFilename: string;
  route: Route | null;
  denoiseOnly: boolean;
  device: Device;
  mode: RunMode | null;
  sample: SampleWindow | null;
  stages: StageRecord[];
  timings: RunTimings;
  cancelled: boolean;
  finalOutputPath: string | null;
}

export function emptyTimings(): RunTimings {
  return { audioDurationSeconds: null, wallClockSeconds: null, wallClockPerAudioMinute: null };
}
