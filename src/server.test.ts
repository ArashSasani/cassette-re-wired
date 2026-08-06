import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "./server.js";
import type { Config } from "./config.js";

async function startServer(config: Config) {
  const app = createApp(config);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function testConfig(): Promise<Config> {
  return {
    port: 0,
    runsRoot: await fs.mkdtemp(path.join(os.tmpdir(), "cassette-server-runs-")),
    pythonVenvPath: "/tmp/definitely-not-a-real-venv",
    device: "auto",
  };
}

test("GET /preflight reports check results without needing a run", async () => {
  const { server, baseUrl } = await startServer(await testConfig());
  try {
    const res = await fetch(`${baseUrl}/preflight`);
    const body = (await res.json()) as { checks: unknown[] };
    assert.equal(res.status, 503); // fake venv path fails
    assert.ok(Array.isArray(body.checks));
  } finally {
    server.close();
  }
});

test("GET /runs/:id 404s for an unknown run", async () => {
  const { server, baseUrl } = await startServer(await testConfig());
  try {
    const res = await fetch(`${baseUrl}/runs/does-not-exist`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("POST /runs requires a source file", async () => {
  const { server, baseUrl } = await startServer(await testConfig());
  try {
    const res = await fetch(`${baseUrl}/runs`, { method: "POST" });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("POST /runs creates a run; GET /runs/:id returns its manifest", async () => {
  const { server, baseUrl } = await startServer(await testConfig());
  try {
    const form = new FormData();
    form.set("source", new Blob([new Uint8Array([1, 2, 3])]), "lecture.mp3");

    const createRes = await fetch(`${baseUrl}/runs`, { method: "POST", body: form });
    assert.equal(createRes.status, 201);
    const { id } = (await createRes.json()) as { id: string };
    assert.ok(id);

    const getRes = await fetch(`${baseUrl}/runs/${id}`);
    assert.equal(getRes.status, 200);
    const manifest = (await getRes.json()) as { id: string; sourceFilename: string };
    assert.equal(manifest.id, id);
    assert.equal(manifest.sourceFilename, "lecture.mp3");
  } finally {
    server.close();
  }
});

test("POST /runs/:id/sample 412s when preflight fails", async () => {
  const { server, baseUrl } = await startServer(await testConfig());
  try {
    const form = new FormData();
    form.set("source", new Blob([new Uint8Array([1, 2, 3])]), "lecture.mp3");
    const createRes = await fetch(`${baseUrl}/runs`, { method: "POST", body: form });
    const { id } = (await createRes.json()) as { id: string };

    const res = await fetch(`${baseUrl}/runs/${id}/sample`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route: "A" }),
    });
    assert.equal(res.status, 412);
  } finally {
    server.close();
  }
});

test("POST /runs/:id/cancel 404s for an unknown run", async () => {
  const { server, baseUrl } = await startServer(await testConfig());
  try {
    const res = await fetch(`${baseUrl}/runs/nope/cancel`, { method: "POST" });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
