let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

/**
 * Call synchronously inside user click handler before async API calls
 * so mobile browsers (iOS Safari / Android Chrome) allow audio playback.
 */
export function unlockAudioContext(): void {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {
    // Ignore audio context restrictions
  }
}

/**
 * Plays a clear electronic EVM-style confirmation BEEP (~650ms).
 */
export function playVoteBeep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, now);

    // Smooth envelope for a loud, clean electronic beep without pops
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.45, now + 0.025);
    gain.gain.setValueAtTime(0.45, now + 0.55);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.75);
  } catch {
    // Gracefully ignore if browser disables Web Audio
  }
}
