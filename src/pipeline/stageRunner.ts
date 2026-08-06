import { spawnTracked } from "../process/spawnTracked.js";
import { updateManifest } from "../runs/runStore.js";
import type { RunManifest, StageRecord } from "../runs/types.js";

function findStage(manifest: RunManifest, name: string): StageRecord {
  const stage = manifest.stages.find((s) => s.name === name);
  if (!stage) throw new Error(`unknown stage "${name}" in manifest ${manifest.id}`);
  return stage;
}

export interface StageRunOptions {
  runsRoot: string;
  runId: string;
  stageName: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** Returns an updated progress fraction (0..1) for a line of output, or null if uninformative. */
  onProgressLine?: (line: string) => number | null;
}

export interface StageRunResult {
  ok: boolean;
  cancelled: boolean;
  error?: string;
}

const STDERR_TAIL_LINES = 20;

/** Runs one pipeline stage as a tracked child process, keeping the manifest in sync. */
export async function runStage(opts: StageRunOptions): Promise<StageRunResult> {
  await updateManifest(opts.runsRoot, opts.runId, (m) => {
    const stage = findStage(m, opts.stageName);
    stage.status = "running";
    stage.startedAt = new Date().toISOString();
  });

  const stderrTail: string[] = [];

  const reportProgress = (line: string) => {
    if (!opts.onProgressLine) return;
    const fraction = opts.onProgressLine(line);
    if (fraction === null) return;
    void updateManifest(opts.runsRoot, opts.runId, (m) => {
      findStage(m, opts.stageName).progress = fraction;
    });
  };

  const result = await spawnTracked({
    runId: opts.runId,
    command: opts.command,
    args: opts.args,
    cwd: opts.cwd,
    env: opts.env,
    onStdoutLine: reportProgress,
    onStderrLine: (line) => {
      stderrTail.push(line);
      if (stderrTail.length > STDERR_TAIL_LINES) stderrTail.shift();
      reportProgress(line);
    },
  });

  const cancelled = result.signal === "SIGTERM" || result.signal === "SIGKILL";
  const ok = result.code === 0 && !cancelled;
  const error = ok ? undefined : stderrTail.join("\n") || `exited with code ${result.code}`;

  await updateManifest(opts.runsRoot, opts.runId, (m) => {
    const stage = findStage(m, opts.stageName);
    stage.endedAt = new Date().toISOString();
    if (ok) {
      stage.status = "done";
      stage.progress = 1;
    } else if (cancelled) {
      stage.status = "cancelled";
    } else {
      stage.status = "failed";
      stage.error = error;
    }
  });

  return { ok, cancelled, error };
}
