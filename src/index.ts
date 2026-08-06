import type { Server } from "node:http";
import { loadConfig, type Config } from "./config.js";
import { runPreflight } from "./preflight.js";
import { createApp } from "./server.js";

export interface StartedServer {
  server: Server;
  config: Config;
  url: string;
}

export async function startServer(config: Config = loadConfig()): Promise<StartedServer> {
  const startupPreflight = await runPreflight(config);
  for (const check of startupPreflight.checks) {
    if (check.ok) {
      console.log(`[preflight] ${check.name}: ok (${check.version})`);
    } else {
      console.warn(`[preflight] ${check.name}: FAILED — ${check.error}`);
    }
  }
  if (!startupPreflight.ok) {
    console.warn("[preflight] one or more checks failed; runs will be rejected until fixed");
  }

  const app = createApp(config);

  const server = await new Promise<Server>((resolve) => {
    // Never 0.0.0.0 — this is a single-user local tool (ADR 0001).
    const s = app.listen(config.port, "127.0.0.1", () => resolve(s));
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  const url = `http://127.0.0.1:${port}`;

  return { server, config, url };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { url } = await startServer();
  console.log(`cassette-re-wired listening on ${url}`);
}
