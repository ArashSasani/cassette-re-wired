export function createCassetteAnimator() {
  const reelLeft = document.getElementById("reel-left")!;
  const reelRight = document.getElementById("reel-right")!;
  const reelLeftHub = document.getElementById("reel-left-hub")!;
  const reelRightHub = document.getElementById("reel-right-hub")!;
  const tapePath = document.getElementById("tape-path")!;

  // The cassette should look like it's spinning whenever the pipeline is
  // running OR either audio player is actually playing — either condition
  // keeps the reels turning.
  let isRunning = false;
  let isAudioPlaying = false;

  function applySpin() {
    const spinning = isRunning || isAudioPlaying;
    reelLeft.classList.toggle("spinning", spinning);
    reelRight.classList.toggle("spinning", spinning);
    tapePath.classList.toggle("playing", spinning);
  }

  return {
    setRunning(running: boolean): void {
      isRunning = running;
      applySpin();
      if (!running) {
        // Rewind the illustration to a fresh, evenly-wound state between runs.
        reelLeftHub.setAttribute("r", "24");
        reelRightHub.setAttribute("r", "24");
      }
    },
    setAudioPlaying(playing: boolean): void {
      isAudioPlaying = playing;
      applySpin();
    },
    // As stages complete, "wind" the tape from the left reel to the right one —
    // left hub shrinks (tape leaving it), right hub grows (tape landing on it).
    setTapeWind(fraction: number): void {
      const f = Math.max(0, Math.min(1, fraction));
      reelLeftHub.setAttribute("r", String(24 - f * 12));
      reelRightHub.setAttribute("r", String(12 + f * 12));
      // Reel closer to empty spins faster, like a real deck under constant tape speed.
      reelLeft.classList.toggle("slow", f > 0.5);
      reelRight.classList.toggle("slow", f <= 0.5);
    },
  };
}

export type CassetteAnimator = ReturnType<typeof createCassetteAnimator>;
