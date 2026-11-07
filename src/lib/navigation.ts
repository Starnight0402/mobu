/**
 * One place that owns "where am I, and what does Back do".
 *
 * - The current screen lives in the URL hash (#/chat), so a reload (pull to
 *   refresh, OTA update, resume) lands on the same screen.
 * - It is also remembered in storage, so a cold start (the OS killed the app,
 *   or the PWA/APK relaunches at "/") reopens the last screen instead of Home.
 * - Every screen change is a real history entry carrying an index, so Back can
 *   mean "the screen I came from" on Android as well as in a browser.
 * - Modals and sheets are history entries too (see backButtonStack), so the
 *   same Back gesture closes them before it leaves the screen.
 */

import { forgetOverlayEntries, onOverlayEntry } from './backButtonStack';

const LAST_TAB_KEY = 'mobu-last-tab';
/** A relaunch after this long opens Home rather than where you left off. */
const RESTORE_WINDOW_MS = 12 * 60 * 60 * 1000;

interface NavState {
  mobuIdx?: number;
  mobuOverlay?: number;
}

const navState = (): NavState => (window.history.state as NavState | null) ?? {};

/** How many screen changes deep this history position is (0 = the first screen). */
export function historyIndex(): number {
  return navState().mobuIdx ?? 0;
}

export function tabFromHash(valid: Set<string>): string | null {
  const tab = window.location.hash.replace(/^#\/?/, '');
  return valid.has(tab) ? tab : null;
}

export function rememberTab(tab: string): void {
  try {
    const entry = JSON.stringify({ tab, at: Date.now() });
    sessionStorage.setItem(LAST_TAB_KEY, entry);
    localStorage.setItem(LAST_TAB_KEY, entry);
  } catch {
    // Storage blocked (private mode): the URL hash still covers plain reloads.
  }
}

function recalledTab(valid: Set<string>): string | null {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const raw = store.getItem(LAST_TAB_KEY);
      if (!raw) continue;
      const { tab, at } = JSON.parse(raw) as { tab?: string; at?: number };
      // A session entry is the same app launch, so no expiry there.
      const fresh = store === sessionStorage || (typeof at === 'number' && Date.now() - at < RESTORE_WINDOW_MS);
      if (tab && valid.has(tab) && fresh) return tab;
    } catch {
      // Unreadable entry: ignore it.
    }
  }
  return null;
}

/** The screen to open at launch: the URL, else the last one you were on, else Home. */
export function initialTab(valid: Set<string>): string {
  const fromHash = tabFromHash(valid);
  if (fromHash) return fromHash;
  const recalled = recalledTab(valid);
  if (recalled && recalled !== 'home') {
    // Put it in the URL too, so the next reload doesn't depend on storage.
    window.history.replaceState({ mobuIdx: 0 }, '', `#/${recalled}`);
    return recalled;
  }
  return 'home';
}

// Scroll positions by history position, so Back lands where you left a screen
// rather than at the top. In memory only: after a reload, screens open at the top.
const scrollByIdx = new Map<number, number>();
let restoreTarget: number | null = null;
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  // We restore it ourselves, once the screen has rendered its content.
  window.history.scrollRestoration = 'manual';
}

/** Called when Back/Forward lands on another screen: aim for where it was left. */
export function markHistoryLanding(): void {
  restoreTarget = scrollByIdx.get(historyIndex()) ?? 0;
}

/** Where the screen that's now showing should be scrolled to (0 for a fresh one). */
export function takeRestoreTarget(): number {
  const y = restoreTarget ?? 0;
  restoreTarget = null;
  return y;
}

/**
 * Scrolls to `y`, retrying for a moment: a screen's data arrives after it
 * mounts, so the page can be too short to reach `y` on the first frame. Any
 * touch or wheel from the user stops it, so it never fights a real scroll.
 */
export function restoreScroll(y: number): void {
  if (y <= 0) {
    window.scrollTo(0, 0);
    return;
  }
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  window.addEventListener('touchstart', cancel, { once: true, passive: true });
  window.addEventListener('wheel', cancel, { once: true, passive: true });
  const until = performance.now() + 1500;
  const step = () => {
    if (cancelled) return;
    window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) > 2 && performance.now() < until) {
      requestAnimationFrame(step);
    } else {
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('wheel', cancel);
    }
  };
  step();
}

/**
 * Moves to a screen as a new history entry.
 *
 * If a modal/sheet is open (you tapped a tab inside it), its own history entry
 * is replaced rather than stacked on: the modal is about to close, and a
 * leftover entry would cost a dead Back press. Any other overlay entries still
 * under it are marked stale, so Back skips them.
 */
export function pushTab(tab: string): void {
  scrollByIdx.set(historyIndex(), window.scrollY);
  const state = { mobuIdx: historyIndex() + 1 };
  scrollByIdx.delete(state.mobuIdx);
  if (onOverlayEntry()) {
    forgetOverlayEntries();
    window.history.replaceState(state, '', `#/${tab}`);
  } else {
    window.history.pushState(state, '', `#/${tab}`);
  }
}

/**
 * Moves to a screen in place of the current history entry, for moves that
 * shouldn't be "Back-able": after saving a form (Back would reopen the empty
 * form) or Back's own jump to Home (a push there made Back bounce between Home
 * and the restored screen forever).
 */
export function replaceTab(tab: string): void {
  scrollByIdx.delete(historyIndex());
  if (onOverlayEntry()) forgetOverlayEntries();
  window.history.replaceState({ mobuIdx: historyIndex() }, '', `#/${tab}`);
}

/** Asks an already-open Memories screen to open its composer (Add → Memory). */
export const OPEN_COMPOSER_EVENT = 'mobu-open-composer';

const RETAP_EVENT = 'mobu-tab-retap';

/**
 * Tapping the bar button of the screen you're already on. A screen can claim
 * it (Chat jumps to the newest message); otherwise the caller scrolls to the
 * top. Returns true if a screen handled it.
 */
export function retapTab(tab: string): boolean {
  return !window.dispatchEvent(new CustomEvent<string>(RETAP_EVENT, { detail: tab, cancelable: true }));
}

export function onRetapTab(tab: string, handler: () => void): () => void {
  const listener = (e: Event) => {
    if ((e as CustomEvent<string>).detail !== tab) return;
    e.preventDefault();
    handler();
  };
  window.addEventListener(RETAP_EVENT, listener);
  return () => window.removeEventListener(RETAP_EVENT, listener);
}

const NAVIGATE_EVENT = 'mobu-navigate';

/** Ask the app shell to open a screen from anywhere (no prop drilling, no <a href="#/…">). */
export function goToTab(tab: string): void {
  window.dispatchEvent(new CustomEvent<string>(NAVIGATE_EVENT, { detail: tab }));
}

export function onGoToTab(listener: (tab: string) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<string>).detail);
  window.addEventListener(NAVIGATE_EVENT, handler);
  return () => window.removeEventListener(NAVIGATE_EVENT, handler);
}

/**
 * Android's Back button. Returns false when there is nothing left to go back
 * to, so the caller can minimise instead of exiting.
 *
 * Home is the start screen: Back there leaves the app, as on any Android app
 * with a bottom bar, instead of replaying every screen you've visited since
 * launch (Home → Chat → Home → Back used to land on Chat).
 */
export function goBack(hasOpenOverlay: boolean, onHome: boolean, goHome: () => void): boolean {
  // An open modal/sheet owns a history entry; popping it closes it.
  if (hasOpenOverlay) {
    window.history.back();
    return true;
  }
  if (onHome) return false;
  if (historyIndex() > 0) {
    window.history.back();
    return true;
  }
  // First screen of this launch but not Home (a restored screen): Home is "back".
  goHome();
  return true;
}
