// One shared AudioContext; each <audio> element can only ever be wrapped in a
// MediaElementSource once, so the analyser graph is built lazily on first
// play and reused across src changes (sample -> full reruns reuse the tag).
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

export function setupVU(audioEl: HTMLAudioElement, containerEl: HTMLElement): void {
  const bars = [...containerEl.querySelectorAll<HTMLElement>(".vu-bar")];
  let analyser: AnalyserNode | null = null;
  let data: Uint8Array<ArrayBuffer> | null = null;

  function ensureGraph() {
    if (analyser) return;
    const ctx = getAudioCtx();
    const source = ctx.createMediaElementSource(audioEl);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    data = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);
    analyser.connect(ctx.destination);
  }

  audioEl.addEventListener("play", () => {
    void getAudioCtx().resume();
    ensureGraph();
  });

  function tick() {
    if (analyser && data && !audioEl.paused) {
      analyser.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / bars.length));
      bars.forEach((bar, i) => {
        bar.style.setProperty("--level", (data![i * step] / 255).toFixed(2));
      });
    } else {
      bars.forEach((bar) => bar.style.setProperty("--level", "0"));
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
