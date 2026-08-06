import type { RunMode } from "../api/client.js";

export interface RunState {
  runId: string | null;
  mode: RunMode | null;
}

type Listener = (state: RunState) => void;

// A tiny observable wrapper around the current run's identity — replaces the
// bare globals `runId`/`currentMode` from the pre-split app.js so callers can
// react to a new run starting instead of polling module-level variables.
export function createRunState() {
  let state: RunState = { runId: null, mode: null };
  const listeners = new Set<Listener>();

  function notify() {
    for (const listener of listeners) listener(state);
  }

  return {
    get(): RunState {
      return state;
    },
    setRun(runId: string): void {
      state = { runId, mode: null };
      notify();
    },
    setMode(mode: RunMode): void {
      state = { ...state, mode };
      notify();
    },
    reset(): void {
      state = { runId: null, mode: null };
      notify();
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type RunStateStore = ReturnType<typeof createRunState>;
