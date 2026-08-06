const PLAY_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

function fmt(sec: number): string {
  if (!isFinite(sec) || isNaN(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function setupPlayer(
  audioEl: HTMLAudioElement,
  playBtn: HTMLButtonElement,
  seekEl: HTMLInputElement,
  timeEl: HTMLElement,
  downloadBtn: HTMLAnchorElement,
): void {
  function updateSeek() {
    const pct = audioEl.duration ? (audioEl.currentTime / audioEl.duration) * 100 : 0;
    seekEl.style.setProperty("--pct", `${pct}%`);
    seekEl.value = String(audioEl.duration ? audioEl.currentTime / audioEl.duration : 0);
    timeEl.textContent = `${fmt(audioEl.currentTime)} / ${fmt(audioEl.duration)}`;
  }

  function resetUI() {
    playBtn.innerHTML = PLAY_ICON;
    playBtn.disabled = true;
    seekEl.disabled = true;
    seekEl.value = "0";
    seekEl.style.setProperty("--pct", "0%");
    timeEl.textContent = "--:-- / --:--";
    downloadBtn.removeAttribute("href");
    downloadBtn.setAttribute("aria-disabled", "true");
  }

  audioEl.addEventListener("loadedmetadata", () => {
    playBtn.disabled = false;
    seekEl.disabled = false;
    downloadBtn.href = audioEl.currentSrc;
    downloadBtn.setAttribute("aria-disabled", "false");
    updateSeek();
  });

  audioEl.addEventListener("timeupdate", updateSeek);
  audioEl.addEventListener("seeked", updateSeek);
  audioEl.addEventListener("play", () => {
    playBtn.innerHTML = PAUSE_ICON;
  });
  audioEl.addEventListener("pause", () => {
    playBtn.innerHTML = PLAY_ICON;
  });
  audioEl.addEventListener("ended", () => {
    playBtn.innerHTML = PLAY_ICON;
  });
  audioEl.addEventListener("emptied", resetUI);

  playBtn.addEventListener("click", () => {
    if (audioEl.paused) audioEl.play().catch(() => {});
    else audioEl.pause();
  });

  seekEl.addEventListener("input", () => {
    if (audioEl.duration) audioEl.currentTime = Number(seekEl.value) * audioEl.duration;
  });
}

// Keep seek position in sync between the two players so A/B comparison stays
// at the same timestamp. Play/pause state is intentionally NOT synced so each
// player's icon and state remain fully independent.
export function linkPlayers(a: HTMLAudioElement, b: HTMLAudioElement): void {
  // A tolerance-based check (rather than a same-tick guard flag) breaks the
  // feedback loop: setting dst.currentTime fires dst's own "seeked" event
  // asynchronously, by which time a same-tick flag has already reset and no
  // longer blocks the reverse sync.
  function syncSeek(src: HTMLAudioElement, dst: HTMLAudioElement) {
    src.addEventListener("seeked", () => {
      if (Math.abs(dst.currentTime - src.currentTime) > 0.05) {
        dst.currentTime = src.currentTime;
      }
    });
  }

  syncSeek(a, b);
  syncSeek(b, a);
}
