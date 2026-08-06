import type { Device } from "../config.js";

/**
 * MPS ops without a fallback kill a long run outright (ADR 0005); always set the
 * fallback. `cpu` additionally hides GPUs from torch so it can't pick one up anyway.
 */
export function buildEnhanceEnv(
  device: Device,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, PYTORCH_ENABLE_MPS_FALLBACK: "1" };
  if (device === "cpu") {
    env.CUDA_VISIBLE_DEVICES = "";
  }
  return env;
}

/**
 * resemble-enhance's own `--device` default is "cuda", which doesn't exist on this
 * hardware (target is an M4 Pro) — there is no CUDA to auto-detect away from, so
 * "auto" resolves to "mps" rather than probing at runtime.
 */
export function resolveTorchDevice(device: Device): "mps" | "cpu" {
  return device === "cpu" ? "cpu" : "mps";
}

/**
 * The generative upscale pass (denoiseOnly: false) saturates the M4 Pro's 24GB
 * unified memory on MPS and drags down the whole machine, not just the enhance
 * stage. Denoise-only is cheap enough that MPS is fine for it. The CLI exposes no
 * memory/chunking knobs to tune this (library-only per ADR 0002), so device choice
 * is the only lever — force CPU whenever the upscale actually runs.
 */
export function resolveEnhanceDevice(device: Device, denoiseOnly: boolean): "mps" | "cpu" {
  if (!denoiseOnly) return "cpu";
  return resolveTorchDevice(device);
}
