import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runPreflight } from "./preflight.js";
import type { Config } from "./config.js";

// ffmpeg-static is what config.ts resolves to by default now (no more relying on a
// system ffmpeg being on PATH), so tests build ffmpegPath the same way instead of
// depending on the test machine having one installed. require() (not a static
// import) matches config.ts and sidesteps ffmpeg-static's awkward CJS type defs.
const require = createRequire(import.meta.url);
const ffmpegPath = (require("ffmpeg-static") as string | null) ?? "ffmpeg";

test("reports ffmpeg availability and surfaces a clear error for a missing venv", async () => {
  const config: Config = {
    port: 0,
    runsRoot: "/tmp/does-not-matter",
    pythonVenvPath: "/tmp/definitely-not-a-real-venv-path",
    device: "auto",
    ffmpegPath,
  };

  const report = await runPreflight(config);

  const ffmpeg = report.checks.find((c) => c.name === "ffmpeg")!;
  assert.equal(ffmpeg.ok, true, "ffmpeg-static should resolve to a working binary");

  const venv = report.checks.find((c) => c.name === "python-venv")!;
  assert.equal(venv.ok, false);
  assert.match(venv.error!, /not found or not executable/);

  assert.equal(report.ok, false);
});

test("skips the DeepFilterNet check unless Route B is requested", async () => {
  const config: Config = {
    port: 0,
    runsRoot: "/tmp/does-not-matter",
    pythonVenvPath: "/tmp/definitely-not-a-real-venv-path",
    device: "auto",
  };

  const withoutB = await runPreflight(config);
  assert.ok(!withoutB.checks.some((c) => c.name === "deepFilter"));

  const withB = await runPreflight(config, { needsDeepFilter: true });
  assert.ok(withB.checks.some((c) => c.name === "deepFilter"));
});
