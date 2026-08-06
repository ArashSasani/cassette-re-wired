import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDecodeArgs, routeBFilters } from "./ffmpegDecode.js";

test("full-file decode: no -ss/-t, mono at requested rate", () => {
  const args = buildDecodeArgs({
    inputPath: "in.mp3",
    outputPath: "out.wav",
    sampleRate: 44100,
  });

  assert.deepEqual(args, [
    "-y",
    "-i",
    "in.mp3",
    "-ac",
    "1",
    "-ar",
    "44100",
    "-progress",
    "pipe:1",
    "-nostats",
    "out.wav",
  ]);
});

test("sample mode: -ss before -i, -t after -i", () => {
  const args = buildDecodeArgs({
    inputPath: "in.mp3",
    outputPath: "out.wav",
    sampleRate: 44100,
    offsetSeconds: 60,
    durationSeconds: 180,
  });

  const ssIndex = args.indexOf("-ss");
  const iIndex = args.indexOf("-i");
  const tIndex = args.indexOf("-t");

  assert.ok(ssIndex >= 0 && ssIndex < iIndex, "-ss must precede -i");
  assert.ok(tIndex > iIndex, "-t must follow -i");
  assert.equal(args[ssIndex + 1], "60");
  assert.equal(args[tIndex + 1], "180");
});

test("route B filters: highpass + mains-hum notch, EU default", () => {
  assert.deepEqual(routeBFilters(50), ["highpass=f=80", "bandreject=f=50:width_type=q:w=30"]);
});

test("route B filters: US mains", () => {
  assert.deepEqual(routeBFilters(60), ["highpass=f=80", "bandreject=f=60:width_type=q:w=30"]);
});

test("filters are joined into a single -af flag", () => {
  const args = buildDecodeArgs({
    inputPath: "in.mp3",
    outputPath: "out.wav",
    sampleRate: 48000,
    filters: routeBFilters(60),
  });

  const afIndex = args.indexOf("-af");
  assert.ok(afIndex >= 0);
  assert.equal(args[afIndex + 1], "highpass=f=80,bandreject=f=60:width_type=q:w=30");
});

test("output path is always the last argument", () => {
  const args = buildDecodeArgs({
    inputPath: "in.mp3",
    outputPath: "out.wav",
    sampleRate: 44100,
  });
  assert.equal(args.at(-1), "out.wav");
});
