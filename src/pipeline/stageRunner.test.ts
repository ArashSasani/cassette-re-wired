import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRun, readManifest, updateManifest } from "../runs/runStore.js";
import { runStage } from "./stageRunner.js";

async function makeRunWithStage(stageName: string) {
  const runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cassette-stagerunner-"));
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "cassette-upload-"));
  const uploadedFilePath = path.join(uploadDir, "upload.mp3");
  await fs.writeFile(uploadedFilePath, "bytes");

  const runId = await createRun({ runsRoot, uploadedFilePath, originalFilename: "a.mp3" });
  await updateManifest(runsRoot, runId, (m) => {
    m.stages.push({ name: stageName, status: "pending", progress: null, startedAt: null, endedAt: null });
  });
  return { runsRoot, runId };
}

test("successful stage: manifest ends up done with progress 1", async () => {
  const { runsRoot, runId } = await makeRunWithStage("decode");

  const result = await runStage({
    runsRoot,
    runId,
    stageName: "decode",
    command: process.execPath,
    args: ["-e", "console.log('50%'); console.log('100%')"],
    onProgressLine: (line) => {
      const match = /(\d+)%/.exec(line);
      return match ? Number(match[1]) / 100 : null;
    },
  });

  assert.equal(result.ok, true);
  const manifest = await readManifest(runsRoot, runId);
  const stage = manifest.stages.find((s) => s.name === "decode")!;
  assert.equal(stage.status, "done");
  assert.equal(stage.progress, 1);
  assert.ok(stage.startedAt && stage.endedAt);
});

test("failing stage: manifest captures stderr tail as the error", async () => {
  const { runsRoot, runId } = await makeRunWithStage("decode");

  const result = await runStage({
    runsRoot,
    runId,
    stageName: "decode",
    command: process.execPath,
    args: ["-e", "console.error('boom'); process.exit(1)"],
  });

  assert.equal(result.ok, false);
  assert.match(result.error!, /boom/);
  const manifest = await readManifest(runsRoot, runId);
  const stage = manifest.stages.find((s) => s.name === "decode")!;
  assert.equal(stage.status, "failed");
  assert.match(stage.error!, /boom/);
});

test("cancelled stage: SIGTERM marks the stage cancelled, not failed", async () => {
  const { runsRoot, runId } = await makeRunWithStage("decode");

  const resultPromise = runStage({
    runsRoot,
    runId,
    stageName: "decode",
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 30000)"],
  });

  const { cancel } = await import("../process/registry.js");
  await new Promise((r) => setTimeout(r, 100));
  cancel(runId);

  const result = await resultPromise;
  assert.equal(result.cancelled, true);
  assert.equal(result.ok, false);

  const manifest = await readManifest(runsRoot, runId);
  const stage = manifest.stages.find((s) => s.name === "decode")!;
  assert.equal(stage.status, "cancelled");
});
