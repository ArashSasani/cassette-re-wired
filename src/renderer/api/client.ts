export type RunMode = "sample" | "full";

export interface RunOptions {
  route: "A" | "B";
  denoiseOnly: boolean;
  device: string;
  mainsHz?: number;
  offsetSeconds?: number;
  durationSeconds?: number;
}

export interface StageStatus {
  name: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  progress?: number | null;
  error?: string;
}

export interface RunManifest {
  stages: StageStatus[];
  finalOutputPath?: string | null;
  timings: {
    wallClockSeconds?: number | null;
    wallClockPerAudioMinute?: number;
  };
}

export interface UploadResult {
  id: string;
}

export async function uploadFile(file: File): Promise<{ ok: true; id: string } | { ok: false; status: number }> {
  const form = new FormData();
  form.set("source", file);
  const res = await fetch("/runs", { method: "POST", body: form });
  if (!res.ok) return { ok: false, status: res.status };
  const body = (await res.json()) as UploadResult;
  return { ok: true, id: body.id };
}

export async function startRun(
  runId: string,
  mode: RunMode,
  options: RunOptions,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`/runs/${runId}/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  const body = (await res.json()) as { error?: string };
  if (!res.ok) return { ok: false, error: body.error ?? String(res.status) };
  return { ok: true };
}

export async function cancelRun(runId: string): Promise<void> {
  await fetch(`/runs/${runId}/cancel`, { method: "POST" });
}

export async function getManifest(runId: string): Promise<RunManifest | null> {
  const res = await fetch(`/runs/${runId}`);
  if (!res.ok) return null;
  return (await res.json()) as RunManifest;
}

export function sourceAudioUrl(runId: string, version: number | string = ""): string {
  return `/runs/${runId}/source-audio${version === "" ? "" : `?v=${version}`}`;
}

export function sampleSourceAudioUrl(runId: string, version: number | string = ""): string {
  return `/runs/${runId}/sample-source-audio${version === "" ? "" : `?v=${version}`}`;
}

export function outputAudioUrl(runId: string, version: number | string = ""): string {
  return `/runs/${runId}/output-audio${version === "" ? "" : `?v=${version}`}`;
}
