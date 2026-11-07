/**
 * Haptics, named by what's happening rather than by millisecond array, so call
 * sites read as what they mean.
 *
 * In the Android app these go to the native MobuHaptics plugin
 * (android/.../MobuHapticsPlugin.java), which plays the phone's own tuned
 * effects and composed vibration primitives: crisp ticks and clicks on a
 * Galaxy S-class motor rather than a flat buzz. Anywhere else (the website, or
 * an older APK without the plugin) they fall back to navigator.vibrate, which
 * can only buzz. iOS Safari has no vibration at all; everything no-ops there.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const STORAGE_KEY = 'mobu-haptics';

export type HapticPattern =
  // Everyday touches
  | 'tap' // any button
  | 'select' // switching tabs, picking an option
  | 'tick' // fine detents: the dock glow passing the +, list steps
  | 'toggleOn'
  | 'toggleOff'
  | 'threshold' // a drag crossed the point where letting go acts
  | 'longPress'
  | 'reveal' // something tucked away came back (the dock on Chat)
  // Outcomes
  | 'success'
  | 'warning'
  | 'error'
  | 'delete'
  // Chat
  | 'send'
  | 'receive'
  | 'heart'
  | 'recordStart'
  | 'recordStop'
  // Alerts
  | 'message'
  | 'ring';

// Only for the fallback: a buzz can't do texture, so these are just short.
const VIBRATE: Record<HapticPattern, number | number[]> = {
  tap: 8,
  select: 14,
  tick: 6,
  toggleOn: 14,
  toggleOff: 10,
  threshold: 14,
  longPress: 30,
  reveal: 10,
  success: [20, 60, 20],
  warning: [60, 60, 60],
  error: [100, 60, 100],
  delete: 40,
  send: [8, 30, 16],
  receive: 12,
  heart: [24, 90, 14],
  recordStart: 24,
  recordStop: [12, 40, 12],
  message: [180, 90, 180],
  ring: [500, 260, 500, 260, 500, 260, 500],
};

// The ring is long and repeating; a plain waveform suits it best everywhere.
const ALWAYS_VIBRATE = new Set<HapticPattern>(['ring']);

interface MobuHapticsPlugin {
  perform(opts: { type: HapticPattern }): Promise<{ via: string }>;
  capabilities(): Promise<{ sdk: number; hasVibrator: boolean; amplitudeControl: boolean; primitives: boolean }>;
}
const MobuHaptics = registerPlugin<MobuHapticsPlugin>('MobuHaptics');

/** True in an APK that ships the native plugin (version 1.2+). */
export const nativeHaptics = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('MobuHaptics');

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export const hapticsSupported = nativeHaptics || canVibrate;

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* best effort */
  }
  if (!enabled) stopHaptics();
}

let lastHapticAt = 0;

function vibrate(pattern: number | number[]) {
  if (!canVibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw if the document hasn't been interacted with yet.
  }
}

export function haptic(pattern: HapticPattern) {
  if (!hapticsSupported || !hapticsEnabled()) return;
  lastHapticAt = performance.now();
  if (nativeHaptics && !ALWAYS_VIBRATE.has(pattern)) {
    MobuHaptics.perform({ type: pattern }).catch(() => vibrate(VIBRATE[pattern]));
    return;
  }
  vibrate(VIBRATE[pattern]);
}

export function stopHaptics() {
  vibrate(0);
}

/**
 * Repeats a pattern until the returned function is called — used for an
 * incoming call, which should keep buzzing until it's answered or declined.
 */
export function startRepeatingHaptic(pattern: HapticPattern, intervalMs: number): () => void {
  if (!hapticsSupported || !hapticsEnabled()) return () => {};
  haptic(pattern);
  const id = setInterval(() => haptic(pattern), intervalMs);
  return () => {
    clearInterval(id);
    stopHaptics();
  };
}

/**
 * Like Gemini: every button gives a light tap, so the whole app feels
 * physical, not just the few places that ask for a specific effect.
 *
 * Native app only (the system tap follows the phone's own touch-feedback
 * setting; a web buzz on every tap would feel cheap). Anything that already
 * played its own effect for this tap is skipped, and `data-no-haptic` opts an
 * element out.
 */
export function installTapHaptics() {
  if (!nativeHaptics) return;
  document.addEventListener('click', (e) => {
    // React handlers (and their own haptics) run first, at the root.
    if (performance.now() - lastHapticAt < 120) return;
    const target = e.target as Element | null;
    const el = target?.closest(
      'button, a[href], [role="button"], [role="switch"], [role="tab"], [role="menuitem"], summary, label',
    );
    if (!el || el.closest('[data-no-haptic]')) return;
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    haptic(el.getAttribute('role') === 'switch' ? (el.getAttribute('aria-checked') === 'true' ? 'toggleOff' : 'toggleOn') : 'tap');
  });
}
