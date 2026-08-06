import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildDurationProbeArgs, parseDurationOutput } from "./ffprobeDuration.js";

const execFileAsync = promisify(execFile);

export async function probeDurationSeconds(inputPath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", buildDurationProbeArgs(inputPath));
  return parseDurationOutput(stdout);
}
