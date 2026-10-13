/**
 * Tiny synthesized sound effects, so the mini world needs no audio assets.
 * Everything runs through one shared AudioContext, which the voice playback
 * reuses too.
 */

const MUTE_KEY = 'mobu-mini-muted';

let ctx: AudioContext | null = null;

export function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // Private mode / blocked storage: the toggle just won't persist.
  }
}

function tone(
  from: number,
  to: number,
  duration: number,
  { type = 'sine', gain = 0.18, delay = 0 }: { type?: OscillatorType; gain?: number; delay?: number } = {},
): void {
  const c = audioCtx();
  const start = c.currentTime + delay;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

const NOTE = (semitonesFromA4: number) => 440 * Math.pow(2, semitonesFromA4 / 12);

export type SfxName = 'boing' | 'pop' | 'squeak' | 'giggle' | 'kiss' | 'sparkle' | 'aww' | 'snore' | 'tune' | 'yay' | 'sob' | 'sigh';

export function sfx(name: SfxName): void {
  if (muted) return;
  try {
    switch (name) {
      case 'boing':
        tone(220, 660, 0.28, { type: 'triangle' });
        break;
      case 'pop':
        tone(900, 220, 0.09);
        break;
      case 'squeak':
        tone(1100, 1700, 0.11, { type: 'triangle', gain: 0.14 });
        break;
      case 'giggle':
        for (let i = 0; i < 6; i++) {
          tone(i % 2 ? 760 : 920, i % 2 ? 700 : 860, 0.07, { type: 'triangle', gain: 0.12, delay: i * 0.08 });
        }
        break;
      case 'kiss':
        tone(1500, 420, 0.12, { gain: 0.16 });
        tone(500, 1300, 0.09, { gain: 0.12, delay: 0.13 });
        break;
      case 'sparkle':
        [3, 7, 10, 15, 19].forEach((n, i) => tone(NOTE(n + 12), NOTE(n + 12), 0.12, { type: 'triangle', gain: 0.08, delay: i * 0.06 }));
        break;
      case 'aww':
        tone(640, 430, 0.45, { gain: 0.14 });
        tone(960, 640, 0.45, { gain: 0.05 });
        break;
      case 'sob':
        for (let i = 0; i < 4; i++) {
          tone(520 - i * 30, 360 - i * 30, 0.32, { type: 'triangle', gain: 0.1, delay: i * 0.55 });
          tone(540 - i * 30, 380 - i * 30, 0.1, { type: 'triangle', gain: 0.05, delay: i * 0.55 + 0.34 });
        }
        break;
      case 'sigh':
        tone(420, 240, 0.7, { gain: 0.1 });
        break;
      case 'snore':
        tone(110, 70, 0.7, { type: 'sawtooth', gain: 0.03 });
        break;
      case 'yay':
        [0, 4, 7, 12].forEach((n, i) => tone(NOTE(n + 3), NOTE(n + 3), 0.16, { type: 'square', gain: 0.05, delay: i * 0.1 }));
        break;
      case 'tune': {
        // A bouncy little loop that lasts about as long as the dance.
        const melody = [3, 7, 10, 7, 8, 12, 10, 7, 3, 7, 10, 15, 14, 10, 12, 15];
        melody.forEach((n, i) => {
          tone(NOTE(n), NOTE(n), 0.22, { type: 'square', gain: 0.05, delay: i * 0.25 });
          if (i % 2 === 0) tone(NOTE(n - 24), NOTE(n - 24), 0.2, { type: 'triangle', gain: 0.08, delay: i * 0.25 });
        });
        break;
      }
    }
  } catch {
    // No Web Audio (very old WebView): stay silent rather than break the scene.
  }
}
