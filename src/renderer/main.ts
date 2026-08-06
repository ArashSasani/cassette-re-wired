import "./styles.css";
import { wireAllSegmented } from "./ui/segmented.js";
import { createRunState } from "./state/run-state.js";
import { wireUpload } from "./ui/upload.js";
import { createCassetteAnimator } from "./ui/cassette.js";
import { createPipelineController } from "./ui/pipeline.js";
import { setupPlayer, linkPlayers } from "./ui/player.js";
import { setupVU } from "./ui/vu-meter.js";

wireAllSegmented();

const runState = createRunState();
const cassette = createCassetteAnimator();
const pipeline = createPipelineController(runState, cassette);

const beforeAudio = document.getElementById("before-audio") as HTMLAudioElement;
const afterAudio = document.getElementById("after-audio") as HTMLAudioElement;

wireUpload(runState, pipeline, {
  onUploadStart() {
    // A fresh upload starts a brand new run — without this reset, a prior
    // run's polling, progress, and playback state would otherwise leak into
    // this one (stale stage list, "after" still pointing at the old output).
    pipeline.resetForNewUpload();
    runState.reset();
    // Detach fully — setting .src="" leaves the element referencing the prior
    // resource on some engines; removeAttribute + load() forces it to release.
    for (const el of [beforeAudio, afterAudio]) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
  },
  onUploadDone() {},
  onUploadFailed() {},
});

linkPlayers(beforeAudio, afterAudio);

setupPlayer(
  beforeAudio,
  document.getElementById("before-play") as HTMLButtonElement,
  document.getElementById("before-seek") as HTMLInputElement,
  document.getElementById("before-time")!,
  document.getElementById("before-download") as HTMLAnchorElement,
);

setupPlayer(
  afterAudio,
  document.getElementById("after-play") as HTMLButtonElement,
  document.getElementById("after-seek") as HTMLInputElement,
  document.getElementById("after-time")!,
  document.getElementById("after-download") as HTMLAnchorElement,
);

setupVU(beforeAudio, document.getElementById("before-vu")!);
setupVU(afterAudio, document.getElementById("after-vu")!);

// Spin the cassette reels while either "before" or "after" is actually playing.
function refreshAudioPlayingState() {
  cassette.setAudioPlaying(!beforeAudio.paused || !afterAudio.paused);
}
[beforeAudio, afterAudio].forEach((el) => {
  ["play", "pause", "ended", "emptied"].forEach((evt) =>
    el.addEventListener(evt, refreshAudioPlayingState),
  );
});
