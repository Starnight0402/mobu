/*
 * A synthesised ringtone rather than a bundled audio file: no binary asset to
 * cache, works offline, and it can't be silenced by a failed media fetch.
 *
 * Uses the classic North American ringback pair (440Hz + 480Hz), gated two
 * seconds on / four off, which reads unmistakably as "a phone is ringing".
 */

let context: AudioContext | null = null;
let unlocked = false;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  return context;
}

/**
 * Browsers refuse to start audio without a prior user gesture, and an incoming
 * call obviously isn't one. Priming the context on the first tap anywhere in
 * the app means the ring can actually sound later.
 */
export function primeAudioOnFirstGesture() {
  if (typeof window === 'undefined' || unlocked) return;

  const unlock = () => {
    const ctx = getContext();
    if (!ctx) return;
    void ctx.resume().catch(() => {});
    // A zero-gain blip is enough to move the context out of 'suspended'.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    unlocked = true;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };

  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });
}

const RING_ON_MS = 2000;
const RING_CYCLE_MS = 6000;

/** Starts ringing; returns a function that stops it. */
export function startRingtone(): () => void {
  const ctx = getContext();
  if (!ctx) return () => {};

  void ctx.resume().catch(() => {});

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active: { osc: OscillatorNode[]; gain: GainNode } | null = null;

  const burst = () => {
    if (stopped) return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    // Soft edges: a hard gate on a pure tone clicks audibly.
    gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.22, ctx.currentTime + RING_ON_MS / 1000 - 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + RING_ON_MS / 1000);
    gain.connect(ctx.destination);

    const osc = [440, 480].map((freq) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(gain);
      o.start();
      o.stop(ctx.currentTime + RING_ON_MS / 1000);
      return o;
    });

    active = { osc, gain };
    timer = setTimeout(burst, RING_CYCLE_MS);
  };

  burst();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    try {
      active?.osc.forEach((o) => o.stop());
      active?.gain.disconnect();
    } catch {
      // Already stopped — nothing to do.
    }
  };
}
