import { test } from "node:test";
import assert from "node:assert/strict";
import { runPreflight } from "./preflight.js";
import type { Config } from "./config.js";

test("reports ffmpeg availability and surfaces a clear error for a missing venv", async () => {
  const config: Config = {
    port: 0,
    runsRoot: "/tmp/does-not-matter",
    pythonVenvPath: "/tmp/definitely-not-a-real-venv-path",
    device: "auto",
  };

  const report = await runPreflight(config);

  const ffmpeg = report.checks.find((c) => c.name === "ffmpeg")!;
  assert.equal(ffmpeg.ok, true, "ffmpeg should be found on PATH in this environment");

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
