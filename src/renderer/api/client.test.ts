import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancelRun,
  getManifest,
  outputAudioUrl,
  sampleSourceAudioUrl,
  sourceAudioUrl,
  startRun,
  uploadFile,
} from "./client.js";

// Swaps global.fetch for the duration of a test and restores it afterwards —
// these modules are thin fetch() wrappers, so verifying the request shape and
// response mapping is the whole point; no real network or DOM needed.
function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test("uploadFile posts a multipart form to /runs and returns the run id", async () => {
  let capturedUrl: string | undefined;
  let capturedMethod: string | undefined;
  let capturedBody: unknown;

  await withFetch(async (url, init) => {
    capturedUrl = String(url);
    capturedMethod = init?.method;
    capturedBody = init?.body;
    return new Response(JSON.stringify({ id: "run-1" }), { status: 201 });
  }, async () => {
    const file = new File(["bytes"], "lecture.mp3", { type: "audio/mpeg" });
    const result = await uploadFile(file);
    assert.deepEqual(result, { ok: true, id: "run-1" });
  });

  assert.equal(capturedUrl, "/runs");
  assert.equal(capturedMethod, "POST");
  assert.ok(capturedBody instanceof FormData);
});

test("uploadFile reports failure status when the server rejects the upload", async () => {
  await withFetch(async () => new Response(JSON.stringify({}), { status: 400 }), async () => {
    const file = new File(["bytes"], "lecture.mp3");
    const result = await uploadFile(file);
    assert.deepEqual(result, { ok: false, status: 400 });
  });
});

test("startRun posts JSON options to /runs/:id/:mode", async () => {
  let capturedUrl: string | undefined;
  let capturedHeaders: HeadersInit | undefined;
  let capturedBody: unknown;

  await withFetch(async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = init?.headers;
    capturedBody = init?.body;
    return new Response(JSON.stringify({ id: "run-1", status: "started" }), { status: 202 });
  }, async () => {
    const result = await startRun("run-1", "sample", {
      route: "A",
      denoiseOnly: true,
      device: "auto",
      offsetSeconds: 60,
      durationSeconds: 180,
    });
    assert.deepEqual(result, { ok: true });
  });

  assert.equal(capturedUrl, "/runs/run-1/sample");
  assert.deepEqual(capturedHeaders, { "Content-Type": "application/json" });
  assert.deepEqual(JSON.parse(capturedBody as string), {
    route: "A",
    denoiseOnly: true,
    device: "auto",
    offsetSeconds: 60,
    durationSeconds: 180,
  });
});

test("startRun surfaces the server's error message on failure", async () => {
  await withFetch(
    async () => new Response(JSON.stringify({ error: "preflight failed" }), { status: 412 }),
    async () => {
      const result = await startRun("run-1", "full", { route: "A", denoiseOnly: true, device: "auto" });
      assert.deepEqual(result, { ok: false, error: "preflight failed" });
    },
  );
});

test("startRun falls back to the status code when no error message is present", async () => {
  await withFetch(async () => new Response(JSON.stringify({}), { status: 500 }), async () => {
    const result = await startRun("run-1", "full", { route: "A", denoiseOnly: true, device: "auto" });
    assert.deepEqual(result, { ok: false, error: "500" });
  });
});

test("cancelRun posts to /runs/:id/cancel", async () => {
  let capturedUrl: string | undefined;
  let capturedMethod: string | undefined;

  await withFetch(async (url, init) => {
    capturedUrl = String(url);
    capturedMethod = init?.method;
    return new Response(JSON.stringify({ id: "run-1", cancelled: true }));
  }, () => cancelRun("run-1"));

  assert.equal(capturedUrl, "/runs/run-1/cancel");
  assert.equal(capturedMethod, "POST");
});

test("getManifest returns null on a non-ok response instead of throwing", async () => {
  await withFetch(async () => new Response(JSON.stringify({ error: "not found" }), { status: 404 }), async () => {
    const manifest = await getManifest("missing-run");
    assert.equal(manifest, null);
  });
});

test("getManifest returns the parsed manifest on success", async () => {
  const manifest = { stages: [], timings: {} };
  await withFetch(async () => new Response(JSON.stringify(manifest), { status: 200 }), async () => {
    const result = await getManifest("run-1");
    assert.deepEqual(result, manifest);
  });
});

test("audio URL builders point at the expected run-scoped endpoints", () => {
  assert.equal(sourceAudioUrl("run-1"), "/runs/run-1/source-audio");
  assert.equal(sampleSourceAudioUrl("run-1"), "/runs/run-1/sample-source-audio");
  assert.equal(outputAudioUrl("run-1"), "/runs/run-1/output-audio");
});
