import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnTracked } from "./spawnTracked.js";
import { isTracked, cancel } from "./registry.js";

// One thin smoke test per CLAUDE.md — real subprocess integration is out of scope here.
test("spawns a real process, line-buffers stdout, and resolves with its exit code", async () => {
  const lines: string[] = [];
  const result = await spawnTracked({
    runId: "smoke-test-run",
    command: process.execPath,
    args: ["-e", "console.log('hello'); console.log('world')"],
    onStdoutLine: (line) => lines.push(line),
  });

  assert.deepEqual(lines, ["hello", "world"]);
  assert.equal(result.code, 0);
  assert.equal(isTracked("smoke-test-run"), false);
});

test("cancel() sends SIGTERM to a tracked long-running process", async () => {
  const promise = spawnTracked({
    runId: "smoke-test-cancel",
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 30000)"],
  });

  await new Promise((r) => setTimeout(r, 100));
  assert.equal(isTracked("smoke-test-cancel"), true);

  const cancelled = cancel("smoke-test-cancel");
  assert.equal(cancelled, true);

  const result = await promise;
  assert.equal(result.signal, "SIGTERM");
});
