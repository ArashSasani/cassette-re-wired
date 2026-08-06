import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDurationProbeArgs, parseDurationOutput } from "./ffprobeDuration.js";

test("builds a duration-only probe with no extraneous output", () => {
  assert.deepEqual(buildDurationProbeArgs("lecture.mp3"), [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    "lecture.mp3",
  ]);
});

test("parses a plain seconds value", () => {
  assert.equal(parseDurationOutput("183.421000\n"), 183.421);
});

test("throws with the offending output on unparseable input", () => {
  assert.throws(() => parseDurationOutput("N/A\n"), /could not parse ffprobe duration output/);
});
