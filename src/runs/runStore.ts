import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { emptyTimings, type RunManifest } from "./types.js";

export function runDir(runsRoot: string, runId: string): string {
  return path.join(runsRoot, runId);
}

function manifestPath(runsRoot: string, runId: string): string {
  return path.join(runDir(runsRoot, runId), "manifest.json");
}

export function sourcePath(runsRoot: string, runId: string): string {
  return path.join(runDir(runsRoot, runId), "source.mp3");
}

export function previewsDir(runsRoot: string, runId: string): string {
  return path.join(runDir(runsRoot, runId), "previews");
}

export interface CreateRunOptions {
  runsRoot: string;
  uploadedFilePath: string;
  originalFilename: string;
}

/** One directory per run, app-owned (ADR 0003). Copies the upload; the original is never touched. */
export async function createRun(opts: CreateRunOptions): Promise<string> {
  const runId = crypto.randomUUID();
  const dir = runDir(opts.runsRoot, runId);

  await fs.mkdir(previewsDir(opts.runsRoot, runId), { recursive: true });
  await fs.copyFile(opts.uploadedFilePath, sourcePath(opts.runsRoot, runId));

  const manifest: RunManifest = {
    id: runId,
    createdAt: new Date().toISOString(),
    sourceFilename: opts.originalFilename,
    route: null,
    denoiseOnly: true,
    device: "auto",
    mode: null,
    sample: null,
    stages: [],
    timings: emptyTimings(),
    cancelled: false,
    finalOutputPath: null,
  };

  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return runId;
}

export async function readManifest(runsRoot: string, runId: string): Promise<RunManifest> {
  const raw = await fs.readFile(manifestPath(runsRoot, runId), "utf8");
  return JSON.parse(raw) as RunManifest;
}

export async function writeManifest(
  runsRoot: string,
  runId: string,
  manifest: RunManifest,
): Promise<void> {
  await fs.writeFile(manifestPath(runsRoot, runId), JSON.stringify(manifest, null, 2));
}

// Node is single-threaded, but async read-modify-write cycles can still interleave;
// chain updates per run so they serialize instead of racing on the same file.
const updateChains = new Map<string, Promise<unknown>>();

export function updateManifest(
  runsRoot: string,
  runId: string,
  updater: (manifest: RunManifest) => RunManifest | void,
): Promise<RunManifest> {
  const previous = updateChains.get(runId) ?? Promise.resolve();

  const next = previous.then(async () => {
    const manifest = await readManifest(runsRoot, runId);
    const result = updater(manifest) ?? manifest;
    await writeManifest(runsRoot, runId, result);
    return result;
  });

  updateChains.set(
    runId,
    next.catch(() => undefined),
  );
  return next;
}
