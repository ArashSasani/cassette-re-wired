import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTqdmPercent } from "./enhancerProgress.js";

test("parses a typical tqdm line", () => {
  const line = " 45%|████▌     | 45/100 [00:12<00:15,  3.75it/s]";
  assert.equal(parseTqdmPercent(line), 0.45);
});

test("parses 0% and 100%", () => {
  assert.equal(parseTqdmPercent("0%|          | 0/100"), 0);
  assert.equal(parseTqdmPercent("100%|██████████| 100/100"), 1);
});

test("returns null for lines with no percent bar", () => {
  assert.equal(parseTqdmPercent("Loading model..."), null);
});
