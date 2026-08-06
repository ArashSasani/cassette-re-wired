import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createRun,
  readManifest,
  updateManifest,
  sourcePath,
  previewsDir,
} from "./runStore.js";

async function tmpRunsRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "cassette-runstore-"));
}

async function tmpUpload(contents: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cassette-upload-"));
  const file = path.join(dir, "upload.mp3");
  await fs.writeFile(file, contents);
  return file;
}

test("createRun copies the upload into a per-run source.mp3 and initializes a manifest", async () => {
  const runsRoot = await tmpRunsRoot();
  const upload = await tmpUpload("fake-mp3-bytes");

  const runId = await createRun({
    runsRoot,
    uploadedFilePath: upload,
    originalFilename: "lecture.mp3",
  });

  const copied = await fs.readFile(sourcePath(runsRoot, runId), "utf8");
  assert.equal(copied, "fake-mp3-bytes");

  const previews = await fs.stat(previewsDir(runsRoot, runId));
  assert.ok(previews.isDirectory());

  const manifest = await readManifest(runsRoot, runId);
  assert.equal(manifest.id, runId);
  assert.equal(manifest.sourceFilename, "lecture.mp3");
  assert.equal(manifest.route, null);
  assert.deepEqual(manifest.stages, []);
});

test("updateManifest applies a mutation and persists it", async () => {
  const runsRoot = await tmpRunsRoot();
  const upload = await tmpUpload("bytes");
  const runId = await createRun({ runsRoot, uploadedFilePath: upload, originalFilename: "a.mp3" });

  await updateManifest(runsRoot, runId, (m) => {
    m.route = "A";
    m.mode = "sample";
  });

  const manifest = await readManifest(runsRoot, runId);
  assert.equal(manifest.route, "A");
  assert.equal(manifest.mode, "sample");
});

test("updateManifest serializes concurrent updates instead of racing", async () => {
  const runsRoot = await tmpRunsRoot();
  const upload = await tmpUpload("bytes");
  const runId = await createRun({ runsRoot, uploadedFilePath: upload, originalFilename: "a.mp3" });

  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      updateManifest(runsRoot, runId, (m) => {
        m.stages.push({
          name: `stage-${i}`,
          status: "pending",
          progress: null,
          startedAt: null,
          endedAt: null,
        });
      }),
    ),
  );

  const manifest = await readManifest(runsRoot, runId);
  assert.equal(manifest.stages.length, 20);
});
