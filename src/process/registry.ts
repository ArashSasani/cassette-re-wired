import type { ChildProcess } from "node:child_process";

/**
 * Tracks live child processes per run so a cancel request can kill everything
 * a run has spawned. Runs last tens of minutes — cancellation is not optional.
 */
const runProcesses = new Map<string, Set<ChildProcess>>();

export function track(runId: string, child: ChildProcess): void {
  let set = runProcesses.get(runId);
  if (!set) {
    set = new Set();
    runProcesses.set(runId, set);
  }
  set.add(child);
  child.once("exit", () => {
    set!.delete(child);
    if (set!.size === 0) runProcesses.delete(runId);
  });
}

export function isTracked(runId: string): boolean {
  return runProcesses.has(runId);
}

/** Cancel every tracked run — used when the host app is quitting entirely. */
export function cancelAll(killTimeoutMs = 5000): void {
  for (const runId of [...runProcesses.keys()]) {
    cancel(runId, killTimeoutMs);
  }
}

/** SIGTERM every tracked process for a run, escalating to SIGKILL if it ignores it. */
export function cancel(runId: string, killTimeoutMs = 5000): boolean {
  const set = runProcesses.get(runId);
  if (!set || set.size === 0) return false;

  for (const child of set) {
    const pid = child.pid;
    if (pid === undefined) continue;
    // Each child is spawned detached (its own process group, pgid === pid), so
    // signaling -pid reaches every subprocess it spawned (e.g. resemble-enhance's
    // Python workers), not just the direct child — plain child.kill() would leave
    // those orphaned and still burning CPU/GPU after "cancel".
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // already exited
    }
    setTimeout(() => {
      if (!child.killed && child.exitCode === null) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // already exited
        }
      }
    }, killTimeoutMs).unref();
  }
  return true;
}
