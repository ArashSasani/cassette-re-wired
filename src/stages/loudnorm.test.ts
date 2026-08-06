import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLoudnormArgs } from "./loudnorm.js";

test("defaults match the brief's Route A export command", () => {
  const args = buildLoudnormArgs({ inputPath: "out/lecture.wav", outputPath: "final/lecture.mp3" });

  assert.deepEqual(args, [
    "-y",
    "-i",
    "out/lecture.wav",
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "2",
    "-progress",
    "pipe:1",
    "-nostats",
    "final/lecture.mp3",
  ]);
});

test("custom loudness targets override defaults", () => {
  const args = buildLoudnormArgs({
    inputPath: "in.wav",
    outputPath: "out.mp3",
    integratedLoudness: -14,
    truePeak: -1,
    loudnessRange: 7,
  });

  const afIndex = args.indexOf("-af");
  assert.equal(args[afIndex + 1], "loudnorm=I=-14:TP=-1:LRA=7");
});

test("output is always mp3 via libmp3lame, never wav", () => {
  const args = buildLoudnormArgs({ inputPath: "in.wav", outputPath: "out.mp3" });
  assert.ok(args.includes("libmp3lame"));
});
