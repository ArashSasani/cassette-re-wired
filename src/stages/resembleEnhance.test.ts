import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEnhanceInvocation } from "./resembleEnhance.js";

test("plain enhance: folder in, folder out, explicit device, no extra flags", () => {
  const inv = buildEnhanceInvocation({
    binPath: "/venv/bin/resemble-enhance",
    inputDir: "prep/",
    outputDir: "out/",
    device: "mps",
  });

  assert.equal(inv.command, "/venv/bin/resemble-enhance");
  assert.deepEqual(inv.args, ["prep/", "out/", "--device", "mps"]);
});

test("denoise-only appends the flag and nothing else", () => {
  const inv = buildEnhanceInvocation({
    binPath: "/venv/bin/resemble-enhance",
    inputDir: "prep/",
    outputDir: "out/",
    device: "cpu",
    denoiseOnly: true,
  });

  assert.deepEqual(inv.args, ["prep/", "out/", "--device", "cpu", "--denoise_only"]);
});

test("never emits fine-grained knobs (chunk_seconds, nfe, lambd, tau) — library-only per ADR 0002", () => {
  const inv = buildEnhanceInvocation({
    binPath: "/venv/bin/resemble-enhance",
    inputDir: "prep/",
    outputDir: "out/",
    device: "mps",
    denoiseOnly: true,
  });

  for (const forbidden of ["--chunk_seconds", "--chunks_overlap", "--nfe", "--lambd", "--tau"]) {
    assert.ok(!inv.args.some((a) => a.startsWith(forbidden)));
  }
});
