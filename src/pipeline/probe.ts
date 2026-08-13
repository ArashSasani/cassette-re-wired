import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildDurationProbeArgs, parseDurationOutput } from "./ffprobeDuration.js";

const execFileAsync = promisify(execFile);

export async function probeDurationSeconds(
  inputPath: string,
  ffprobePath: string = "ffprobe",
): Promise<number> {
  const { stdout } = await execFileAsync(ffprobePath, buildDurationProbeArgs(inputPath));
  return parseDurationOutput(stdout);
}
