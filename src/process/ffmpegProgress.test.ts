import { test } from "node:test";
import assert from "node:assert/strict";
import { FfmpegProgressTracker, fractionFromSnapshot } from "./ffmpegProgress.js";

test("emits a snapshot only when a block closes on the progress= key", () => {
  const tracker = new FfmpegProgressTracker();
  assert.equal(tracker.ingestLine("frame=10"), null);
  assert.equal(tracker.ingestLine("out_time_us=1000000"), null);
  const snapshot = tracker.ingestLine("progress=continue");
  assert.deepEqual(snapshot, { frame: "10", out_time_us: "1000000", progress: "continue" });
});

test("resets accumulator between blocks", () => {
  const tracker = new FfmpegProgressTracker();
  tracker.ingestLine("frame=10");
  tracker.ingestLine("progress=continue");
  const second = tracker.ingestLine("progress=end");
  assert.deepEqual(second, { progress: "end" });
});

test("ignores malformed lines without an =", () => {
  const tracker = new FfmpegProgressTracker();
  assert.equal(tracker.ingestLine("not a kv line"), null);
});

test("fraction computed from out_time_us over total duration", () => {
  const fraction = fractionFromSnapshot({ out_time_us: "90000000", progress: "continue" }, 180);
  assert.equal(fraction, 0.5);
});

test("progress=end always reports 1 regardless of out_time_us", () => {
  const fraction = fractionFromSnapshot({ out_time_us: "1", progress: "end" }, 180);
  assert.equal(fraction, 1);
});

test("clamps fraction to [0, 1]", () => {
  const over = fractionFromSnapshot({ out_time_us: "999999999", progress: "continue" }, 1);
  assert.equal(over, 1);
});

test("returns null when out_time_us is missing", () => {
  const fraction = fractionFromSnapshot({ progress: "continue" }, 180);
  assert.equal(fraction, null);
});
