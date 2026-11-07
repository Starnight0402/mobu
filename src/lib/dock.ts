/**
 * Whether the bottom dock is tucked away.
 *
 * A screen can ask for the dock to hide while it's open (Chat does, so the
 * thread and the message box get the whole bottom of the screen). The dock
 * then slides down out of the way, leaving a small handle; tapping or swiping
 * up on the handle brings it back, and it tucks itself away again as soon as
 * you start typing, scroll the thread, or swipe the dock down.
 */
import { useEffect, useSyncExternalStore } from 'react';

type State = { autoHide: boolean; revealed: boolean };

let state: State = { autoHide: false, revealed: false };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Call from a screen that wants the dock out of the way while it's open. */
export function useDockAutoHide() {
  useEffect(() => {
    set({ autoHide: true, revealed: false });
    return () => set({ autoHide: false, revealed: false });
  }, []);
}

export function revealDock() {
  if (state.autoHide && !state.revealed) set({ revealed: true });
}

export function hideDock() {
  if (state.autoHide && state.revealed) set({ revealed: false });
}

/** True while the dock is tucked away. */
export function useDockHidden(): boolean {
  return useSyncExternalStore(subscribe, () => state.autoHide && !state.revealed);
}

/** True while the current screen hides the dock (whether or not it's shown right now). */
export function useDockAutoHideActive(): boolean {
  return useSyncExternalStore(subscribe, () => state.autoHide);
}

const HIDE_AFTER_PX = 48;

/**
 * Once you've brought the dock back, dragging the thread a bit tucks it away
 * again.
 *
 * This watches your finger (and the mouse wheel), not scroll events: bringing
 * the dock back makes the thread scroll itself to keep the latest message in
 * view, and reacting to that scroll hid the dock again the instant it
 * appeared, so the handle seemed to do nothing.
 */
export function useHideDockOnScroll() {
  const autoHide = useDockAutoHideActive();
  useEffect(() => {
    if (!autoHide) return;
    let startY: number | null = null;
    let wheel = 0;
    const onTouchStart = (e: TouchEvent) => {
      // Touches on the dock or its handle are for the dock itself.
      const t = e.target as Element | null;
      startY = t?.closest('nav, [data-dock-handle]') ? null : e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY == null || !state.revealed) return;
      if (Math.abs(e.touches[0].clientY - startY) > HIDE_AFTER_PX) {
        startY = null;
        hideDock();
      }
    };
    const onTouchEnd = () => {
      startY = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!state.revealed) {
        wheel = 0;
        return;
      }
      wheel += Math.abs(e.deltaY);
      if (wheel > HIDE_AFTER_PX) {
        wheel = 0;
        hideDock();
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('wheel', onWheel);
    };
  }, [autoHide]);
}
