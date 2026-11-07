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

type State = { autoHide: boolean; revealed: boolean; revealedAtY: number };

let state: State = { autoHide: false, revealed: false, revealedAtY: 0 };
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
  if (state.autoHide && !state.revealed) set({ revealed: true, revealedAtY: window.scrollY });
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

/** Once you've brought the dock back, scrolling the thread a bit tucks it away again. */
export function useHideDockOnScroll() {
  const autoHide = useDockAutoHideActive();
  useEffect(() => {
    if (!autoHide) return;
    const onScroll = () => {
      if (state.revealed && Math.abs(window.scrollY - state.revealedAtY) > 48) hideDock();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [autoHide]);
}
