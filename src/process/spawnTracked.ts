import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { track } from "./registry.js";

export interface SpawnTrackedOptions {
  runId: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
}

export interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

/** Spawns a child process, tracks it under the run's registry entry, and line-buffers its output. */
export function spawnTracked(opts: SpawnTrackedOptions): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group so cancel() can kill the whole subprocess tree (e.g. the
      // Python workers resemble-enhance spawns), not just this direct child.
      detached: true,
    });

    track(opts.runId, child);

    if (opts.onStdoutLine) {
      createInterface({ input: child.stdout }).on("line", opts.onStdoutLine);
    }
    if (opts.onStderrLine) {
      createInterface({ input: child.stderr }).on("line", opts.onStderrLine);
    }

    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}
