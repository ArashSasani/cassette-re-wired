import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeepFilterInvocation } from "./deepFilter.js";

test("whole-file invocation: -o outputDir, then the single input wav", () => {
  const inv = buildDeepFilterInvocation({
    binPath: "/venv/bin/deepFilter",
    inputPath: "prep/lecture.wav",
    outputDir: "denoised/",
  });

  assert.equal(inv.command, "/venv/bin/deepFilter");
  assert.deepEqual(inv.args, ["-o", "denoised/", "prep/lecture.wav"]);
});
