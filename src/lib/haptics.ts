/**
 * Vibration patterns, named by intent rather than by millisecond array so call
 * sites read as what they mean.
 *
 * The Vibration API is Android-only in practice — iOS Safari has never shipped
 * it. Everything here no-ops silently rather than feature-detecting at every
 * call site.
 */

const STORAGE_KEY = 'mobu-haptics';

export type HapticPattern =
  | 'tap'
  | 'select'
  | 'success'
  | 'warning'
  | 'error'
  | 'message'
  | 'ring';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 12,
  select: 20,
  success: [30, 60, 30],
  warning: [90, 60, 90],
  error: [140, 70, 140, 70, 140],
  message: [180, 90, 180],
  ring: [500, 260, 500, 260, 500, 260, 500],
};

export const hapticsSupported =
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function hapticsEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEY) !== 'off';
}

export function setHapticsEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  if (!enabled) stopHaptics();
}

export function haptic(pattern: HapticPattern) {
  if (!hapticsSupported || !hapticsEnabled()) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers throw if the document hasn't been interacted with yet.
  }
}

export function stopHaptics() {
  if (!hapticsSupported) return;
  try {
    navigator.vibrate(0);
  } catch {
    /* no-op */
  }
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
