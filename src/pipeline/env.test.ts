import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEnhanceEnv, resolveEnhanceDevice } from "./env.js";

test("always sets the MPS fallback", () => {
  const env = buildEnhanceEnv("auto", {});
  assert.equal(env.PYTORCH_ENABLE_MPS_FALLBACK, "1");
});

test("cpu device hides GPUs from torch", () => {
  const env = buildEnhanceEnv("cpu", {});
  assert.equal(env.CUDA_VISIBLE_DEVICES, "");
});

test("mps/auto leave device selection to torch's own defaults", () => {
  const env = buildEnhanceEnv("mps", {});
  assert.equal(env.CUDA_VISIBLE_DEVICES, undefined);
});

test("preserves the base environment", () => {
  const env = buildEnhanceEnv("auto", { PATH: "/usr/bin" });
  assert.equal(env.PATH, "/usr/bin");
});

test("full enhance (denoiseOnly false) is always forced to cpu", () => {
  assert.equal(resolveEnhanceDevice("auto", false), "cpu");
  assert.equal(resolveEnhanceDevice("mps", false), "cpu");
  assert.equal(resolveEnhanceDevice("cpu", false), "cpu");
});

test("denoise-only leaves device selection to resolveTorchDevice", () => {
  assert.equal(resolveEnhanceDevice("auto", true), "mps");
  assert.equal(resolveEnhanceDevice("mps", true), "mps");
  assert.equal(resolveEnhanceDevice("cpu", true), "cpu");
});
