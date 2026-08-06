import {
  cancelRun,
  getManifest,
  outputAudioUrl,
  sampleSourceAudioUrl,
  sourceAudioUrl,
  startRun,
  type RunManifest,
  type RunMode,
  type RunOptions,
} from "../api/client.js";
import type { CassetteAnimator } from "./cassette.js";
import type { RunStateStore } from "../state/run-state.js";

function statusLabel(stage: RunManifest["stages"][number]): string {
  const pct = stage.progress != null ? ` (${Math.round(stage.progress * 100)}%)` : "";
  return `${stage.status}${pct}`;
}

export function createPipelineController(runState: RunStateStore, cassette: CassetteAnimator) {
  const progressSection = document.getElementById("progress-section")!;
  const playbackSection = document.getElementById("playback-section")!;
  const preflightStatus = document.getElementById("preflight-status")!;
  const stageList = document.getElementById("stage-list")!;
  const timingsEl = document.getElementById("timings")!;
  const exportStatus = document.getElementById("export-status")!;
  const beforeAudio = document.getElementById("before-audio") as HTMLAudioElement;
  const afterAudio = document.getElementById("after-audio") as HTMLAudioElement;
  const routeSelect = document.getElementById("route") as HTMLSelectElement;
  const deviceSelect = document.getElementById("device") as HTMLSelectElement;
  const mainsSelect = document.getElementById("mains-hz") as HTMLSelectElement;
  const mainsRow = document.getElementById("mains-row")!;
  const sampleOffset = document.getElementById("sample-offset") as HTMLInputElement;
  const sampleDuration = document.getElementById("sample-duration") as HTMLInputElement;
  const runSampleBtn = document.getElementById("run-sample") as HTMLButtonElement;
  const runFullBtn = document.getElementById("run-full") as HTMLButtonElement;
  const cancelBtn = document.getElementById("cancel-run") as HTMLButtonElement;

  let pollHandle: ReturnType<typeof setInterval> | null = null;
  // Bumped on every upload AND every run start. Appended as `?v=<nonce>` to
  // every audio URL, so no two `<audio>` loads across the session ever share
  // an identical URL — this is what stops the browser or the media element
  // from replaying a previous run's audio on a rerun (or after a new upload).
  let audioCacheNonce = 0;
  function bumpNonce(): number {
    audioCacheNonce++;
    return audioCacheNonce;
  }

  function detachAudio(el: HTMLAudioElement): void {
    el.pause();
    el.removeAttribute("src");
    // load() forces the media element to release its current resource; without
    // it, some engines keep the previous buffer around and can end up playing
    // it briefly when a new src is set right after.
    el.load();
  }

  function setAudioSrc(el: HTMLAudioElement, url: string): void {
    detachAudio(el);
    el.src = url;
    el.load();
  }

  function setRunning(running: boolean) {
    runSampleBtn.disabled = running;
    runFullBtn.disabled = running;
    cancelBtn.disabled = !running;
    cassette.setRunning(running);
  }

  function stopPolling() {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
      setRunning(false);
    }
  }

  routeSelect.addEventListener("change", () => {
    mainsRow.hidden = !routeSelect.value.startsWith("B");
    playbackSection.hidden = true;
  });

  function currentOptions(mode: RunMode): RunOptions {
    const routeVal = routeSelect.value; // "A" | "A-gen" | "B" | "B-gen"
    const opts: RunOptions = {
      route: routeVal.startsWith("B") ? "B" : "A",
      denoiseOnly: !routeVal.endsWith("-gen"),
      device: deviceSelect.value,
    };
    if (opts.route === "B") {
      opts.mainsHz = Number(mainsSelect.value);
    }
    if (mode === "sample") {
      opts.offsetSeconds = Number(sampleOffset.value);
      opts.durationSeconds = Number(sampleDuration.value);
    }
    return opts;
  }

  function renderManifest(manifest: RunManifest) {
    const { runId, mode } = runState.get();
    if (!runId) return;

    // Sample runs process a decoded excerpt, not the full file — once decode is
    // done, point "before" at that same excerpt so before/after are the same
    // segment/length.
    if (mode === "sample") {
      const decodeDone = manifest.stages.some((s) => s.name === "decode" && s.status === "done");
      if (decodeDone) {
        const src = sampleSourceAudioUrl(runId, audioCacheNonce);
        if (!beforeAudio.src.endsWith(src)) {
          setAudioSrc(beforeAudio, src);
        }
      }
    }

    stageList.innerHTML = "";
    for (const stage of manifest.stages) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="stage-name">${stage.name}</span><span class="status-${stage.status}">${statusLabel(stage)}</span>`;
      if (stage.error) {
        li.title = stage.error;
      }
      stageList.appendChild(li);
    }

    if (manifest.stages.length > 0) {
      const perStage = manifest.stages.map((s) => {
        if (s.status === "done") return 1;
        if (s.status === "running") return s.progress ?? 0.5;
        return 0;
      });
      const overall = perStage.reduce((a, b) => a + b, 0) / perStage.length;
      cassette.setTapeWind(overall);
    }

    const t = manifest.timings;
    if (t.wallClockSeconds != null) {
      timingsEl.textContent = `wall clock: ${t.wallClockSeconds.toFixed(1)}s, ${t.wallClockPerAudioMinute!.toFixed(1)}s per audio-minute`;
    } else {
      timingsEl.textContent = "";
    }

    const allDone = manifest.stages.length > 0 && manifest.stages.every((s) => s.status === "done");

    if (manifest.finalOutputPath && allDone) {
      playbackSection.hidden = false;
      const src = outputAudioUrl(runId, audioCacheNonce);
      if (!afterAudio.src.endsWith(src)) {
        setAudioSrc(afterAudio, src);
      }
      exportStatus.textContent = "";
    }

    const finished =
      manifest.stages.length > 0 &&
      manifest.stages.every((s) => s.status === "done" || s.status === "failed" || s.status === "cancelled");
    if (finished) {
      stopPolling();
    }
  }

  function startPolling(runId: string) {
    stopPolling();
    pollHandle = setInterval(async () => {
      const manifest = await getManifest(runId);
      if (manifest) renderManifest(manifest);
    }, 1000);
  }

  async function startRunAndPoll(mode: RunMode) {
    const { runId } = runState.get();
    if (!runId) return;
    runState.setMode(mode);

    // Fresh cache-buster for this run: rerunning on the same runId reuses the
    // sample-source and output URLs, and the browser will otherwise hand the
    // <audio> element cached bytes from the previous run's files.
    const nonce = bumpNonce();

    // Always repoint "before" back to the plain source before a run starts: a
    // rerun of "sample" reuses the same sample-source-audio URL, and the
    // decode stage is about to rewrite the file it points to, so an audio
    // element left on that stale URL can end up reading it mid-rewrite.
    setAudioSrc(beforeAudio, sourceAudioUrl(runId, nonce));
    preflightStatus.textContent = "";

    const result = await startRun(runId, mode, currentOptions(mode));
    if (!result.ok) {
      preflightStatus.textContent = `Could not start: ${result.error}`;
      return;
    }

    // Reset both players: clear stale output, rewind to 0, and hide the
    // playback section until new output arrives.
    beforeAudio.pause();
    beforeAudio.currentTime = 0;
    detachAudio(afterAudio);
    afterAudio.currentTime = 0;
    exportStatus.textContent = "";
    playbackSection.hidden = true;

    setRunning(true);
    progressSection.hidden = false;
    startPolling(runId);
  }

  runSampleBtn.addEventListener("click", () => void startRunAndPoll("sample"));
  runFullBtn.addEventListener("click", () => void startRunAndPoll("full"));

  cancelBtn.addEventListener("click", async () => {
    const { runId } = runState.get();
    if (!runId) return;
    await cancelRun(runId);
  });

  return {
    stopPolling,
    setRunning,
    resetForNewUpload(): void {
      stopPolling();
      setRunning(false);
      preflightStatus.textContent = "";
      progressSection.hidden = true;
      stageList.innerHTML = "";
      timingsEl.textContent = "";
      playbackSection.hidden = true;
      exportStatus.textContent = "";
    },
    // Every new upload advances the nonce so the plain source URL for the new
    // runId can't collide with anything a previous run left cached — used by
    // upload.ts when it points the "before" player at the freshly uploaded file.
    nextAudioNonce(): number {
      return bumpNonce();
    },
    setBeforeAudio: (url: string) => setAudioSrc(beforeAudio, url),
  };
}

export type PipelineController = ReturnType<typeof createPipelineController>;
