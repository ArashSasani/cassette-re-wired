import { test } from "node:test";
import assert from "node:assert/strict";
import { createRunState } from "./run-state.js";

test("starts with no run and no mode", () => {
  const state = createRunState();
  assert.deepEqual(state.get(), { runId: null, mode: null });
});

test("setRun sets the run id and clears any prior mode", () => {
  const state = createRunState();
  state.setMode("full");
  state.setRun("run-1");
  assert.deepEqual(state.get(), { runId: "run-1", mode: null });
});

test("setMode preserves the current run id", () => {
  const state = createRunState();
  state.setRun("run-1");
  state.setMode("sample");
  assert.deepEqual(state.get(), { runId: "run-1", mode: "sample" });
});

test("reset clears both run id and mode", () => {
  const state = createRunState();
  state.setRun("run-1");
  state.setMode("sample");
  state.reset();
  assert.deepEqual(state.get(), { runId: null, mode: null });
});

test("subscribers are notified on every state change with the new state", () => {
  const state = createRunState();
  const seen: unknown[] = [];
  state.subscribe((s) => seen.push({ ...s }));

  state.setRun("run-1");
  state.setMode("full");
  state.reset();

  assert.deepEqual(seen, [
    { runId: "run-1", mode: null },
    { runId: "run-1", mode: "full" },
    { runId: null, mode: null },
  ]);
});

test("unsubscribe stops further notifications", () => {
  const state = createRunState();
  const seen: unknown[] = [];
  const unsubscribe = state.subscribe((s) => seen.push({ ...s }));

  state.setRun("run-1");
  unsubscribe();
  state.setMode("full");

  assert.equal(seen.length, 1);
});
