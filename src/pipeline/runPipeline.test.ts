import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRun, readManifest } from "../runs/runStore.js";
import { runPipeline } from "./runPipeline.js";
import type { Config } from "../config.js";

// Fakes ffmpeg/ffprobe/resemble-enhance as shell scripts on PATH so the pipeline's
// wiring (stage order, manifest updates, file handoff) can be tested without the
// real tools installed. Per CLAUDE.md: test the argv builders and orchestration,
// not FFmpeg itself.
async function makeFakeToolchain(): Promise<{ binDir: string; venvPath: string }> {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "cassette-fakebin-"));

  await fs.writeFile(
    path.join(binDir, "ffprobe"),
    `#!/bin/sh\necho "12.0"\n`,
    { mode: 0o755 },
  );

  // Reads the last arg as output path, writes a placeholder wav, emits ffmpeg-style progress.
  await fs.writeFile(
    path.join(binDir, "ffmpeg"),
    `#!/bin/sh\necho "out_time_us=12000000"\necho "progress=end"\nfor a in "$@"; do :; done\necho fake-wav > "$a"\n`,
    { mode: 0o755 },
  );

  const venvPath = await fs.mkdtemp(path.join(os.tmpdir(), "cassette-fakevenv-"));
  await fs.mkdir(path.join(venvPath, "bin"), { recursive: true });
  // args: <inputDir> <outputDir> [--denoise_only]
  await fs.writeFile(
    path.join(venvPath, "bin", "resemble-enhance"),
    `#!/bin/sh\necho "50%|#####     | 50/100"\nmkdir -p "$2"\necho fake-enhanced > "$2/audio.wav"\n`,
    { mode: 0o755 },
  );
  await fs.writeFile(path.join(venvPath, "bin", "python"), `#!/bin/sh\necho "Python 3.11.0"\n`, {
    mode: 0o755,
  });
  await fs.chmod(path.join(venvPath, "bin", "resemble-enhance"), 0o755);
  await fs.chmod(path.join(venvPath, "bin", "python"), 0o755);

  return { binDir, venvPath };
}

test("route A: decode -> enhance -> loudnorm runs end to end and records timings", async () => {
  const { binDir, venvPath } = await makeFakeToolchain();
  const runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cassette-pipeline-"));
  const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "cassette-upload-"));
  const uploadedFilePath = path.join(uploadDir, "upload.mp3");
  await fs.writeFile(uploadedFilePath, "bytes");

  const runId = await createRun({ runsRoot, uploadedFilePath, originalFilename: "lecture.mp3" });

  const config: Config = {
    port: 0,
    runsRoot,
    pythonVenvPath: venvPath,
    device: "auto",
  };

  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}:${originalPath}`;
  try {
    await runPipeline(config, runId, {
      route: "A",
      mode: "sample",
      denoiseOnly: false,
      device: "auto",
      sample: { offsetSeconds: 60, durationSeconds: 12 },
    });
  } finally {
    process.env.PATH = originalPath;
  }

  const manifest = await readManifest(runsRoot, runId);
  assert.equal(
    manifest.stages.every((s) => s.status === "done"),
    true,
    JSON.stringify(manifest.stages),
  );
  assert.ok(manifest.finalOutputPath);
  assert.ok(manifest.timings.wallClockSeconds !== null);
  assert.ok(manifest.timings.wallClockPerAudioMinute !== null);

  const finalContents = await fs.readFile(manifest.finalOutputPath!, "utf8");
  assert.equal(finalContents.trim(), "fake-wav");
});
