import express, { type Express } from "express";
import multer from "multer";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import type { Config } from "./config.js";
import { runPreflight } from "./preflight.js";
import { createRun, readManifest, runDir, sourcePath } from "./runs/runStore.js";
import type { Route, RunMode, SampleWindow } from "./runs/types.js";
import { runPipeline } from "./pipeline/runPipeline.js";
import { prepWavPath } from "./pipeline/paths.js";
import { cancel as cancelRun } from "./process/registry.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// Compiled to dist/src/server.js — climb back to the project root, then into
// the Vite-built renderer bundle (src/renderer -> dist/renderer).
const rendererDir = path.join(__dirname, "..", "..", "dist", "renderer");

const DEFAULT_SAMPLE_OFFSET_SECONDS = 60;
const DEFAULT_SAMPLE_DURATION_SECONDS = 180;

const upload = multer({ dest: os.tmpdir() });

// A run can only have one pipeline execution in flight at a time.
const activeRuns = new Set<string>();

interface RunRequestBody {
  route?: Route;
  denoiseOnly?: boolean;
  device?: Config["device"];
  mainsHz?: 50 | 60;
  offsetSeconds?: number;
  durationSeconds?: number;
}

function parseRoute(body: RunRequestBody): Route {
  return body.route === "B" ? "B" : "A";
}

async function startPipeline(
  config: Config,
  runId: string,
  mode: RunMode,
  body: RunRequestBody,
): Promise<{ error: string; status: number } | null> {
  if (activeRuns.has(runId)) {
    return { error: "a pipeline is already running for this run", status: 409 };
  }

  const route = parseRoute(body);
  const preflight = await runPreflight(config, { needsDeepFilter: route === "B" });
  if (!preflight.ok) {
    const detail = preflight.checks
      .filter((c) => !c.ok)
      .map((c) => `${c.name}: ${c.error}`)
      .join("; ");
    return { error: `preflight failed — ${detail}`, status: 412 };
  }

  const sample: SampleWindow | null =
    mode === "sample"
      ? {
          offsetSeconds: body.offsetSeconds ?? DEFAULT_SAMPLE_OFFSET_SECONDS,
          durationSeconds: body.durationSeconds ?? DEFAULT_SAMPLE_DURATION_SECONDS,
        }
      : null;

  const denoiseOnly = body.denoiseOnly ?? true;
  const device = body.device ?? config.device;
  if (!denoiseOnly && device !== "cpu") {
    console.warn(
      `run ${runId}: full enhance forced to cpu — MPS upscale can overwhelm unified memory`,
    );
  }

  activeRuns.add(runId);
  runPipeline(config, runId, {
    route,
    mode,
    denoiseOnly,
    device,
    sample,
    mainsHz: body.mainsHz,
  })
    .catch((err) => {
      console.error(`run ${runId} failed:`, err);
    })
    .finally(() => {
      activeRuns.delete(runId);
    });

  return null;
}

export function createApp(config: Config): Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(rendererDir));

  app.get("/preflight", async (req, res) => {
    const needsDeepFilter = req.query.route === "B";
    const report = await runPreflight(config, { needsDeepFilter });
    res.status(report.ok ? 200 : 503).json(report);
  });

  app.post("/runs", upload.single("source"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "missing 'source' file field" });
      return;
    }
    try {
      const runId = await createRun({
        runsRoot: config.runsRoot,
        uploadedFilePath: req.file.path,
        originalFilename: req.file.originalname,
      });
      res.status(201).json({ id: runId });
    } finally {
      await fs.unlink(req.file.path).catch(() => {});
    }
  });

  app.get("/runs/:id", async (req, res) => {
    try {
      const manifest = await readManifest(config.runsRoot, req.params.id);
      res.json(manifest);
    } catch {
      res.status(404).json({ error: "run not found" });
    }
  });

  app.post("/runs/:id/sample", async (req, res) => {
    const runId = req.params.id;
    try {
      await readManifest(config.runsRoot, runId);
    } catch {
      res.status(404).json({ error: "run not found" });
      return;
    }

    const failure = await startPipeline(config, runId, "sample", req.body ?? {});
    if (failure) {
      res.status(failure.status).json({ error: failure.error });
      return;
    }
    res.status(202).json({ id: runId, status: "started" });
  });

  app.post("/runs/:id/full", async (req, res) => {
    const runId = req.params.id;
    try {
      await readManifest(config.runsRoot, runId);
    } catch {
      res.status(404).json({ error: "run not found" });
      return;
    }

    const failure = await startPipeline(config, runId, "full", req.body ?? {});
    if (failure) {
      res.status(failure.status).json({ error: failure.error });
      return;
    }
    res.status(202).json({ id: runId, status: "started" });
  });

  // Files under a run directory can be rewritten across reruns on the same
  // runId (sample-source-audio, output-audio); tell the browser never to reuse
  // a cached copy so the <audio> element always fetches the current bytes.
  function noStore(res: express.Response): void {
    res.setHeader("Cache-Control", "no-store");
  }

  app.get("/runs/:id/source-audio", async (req, res) => {
    const runId = req.params.id;
    try {
      await readManifest(config.runsRoot, runId);
    } catch {
      res.status(404).json({ error: "run not found" });
      return;
    }
    noStore(res);
    res.sendFile(sourcePath(config.runsRoot, runId), (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: "source audio not found" });
      }
    });
  });

  // Sample runs process a decoded excerpt (offset/duration), not the full source —
  // this serves that same excerpt so the "before" player matches "after" in both
  // segment and length, instead of comparing the whole file to a 3-minute clip.
  app.get("/runs/:id/sample-source-audio", async (req, res) => {
    const runId = req.params.id;
    try {
      await readManifest(config.runsRoot, runId);
    } catch {
      res.status(404).json({ error: "run not found" });
      return;
    }
    noStore(res);
    res.sendFile(prepWavPath(runDir(config.runsRoot, runId)), (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: "sample source audio not found" });
      }
    });
  });

  app.get("/runs/:id/output-audio", async (req, res) => {
    const runId = req.params.id;
    let manifest;
    try {
      manifest = await readManifest(config.runsRoot, runId);
    } catch {
      res.status(404).json({ error: "run not found" });
      return;
    }
    if (!manifest.finalOutputPath) {
      res.status(404).json({ error: "no output yet for this run" });
      return;
    }
    noStore(res);
    res.sendFile(manifest.finalOutputPath, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: "output audio not found" });
      }
    });
  });

  app.post("/runs/:id/cancel", async (req, res) => {
    const runId = req.params.id;
    try {
      await readManifest(config.runsRoot, runId);
    } catch {
      res.status(404).json({ error: "run not found" });
      return;
    }

    const cancelled = cancelRun(runId);
    res.json({ id: runId, cancelled });
  });

  return app;
}
