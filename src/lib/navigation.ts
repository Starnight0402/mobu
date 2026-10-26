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

/**
 * Moves to a screen as a new history entry.
 *
 * If a modal/sheet is open (you tapped a tab inside it), its own history entry
 * is replaced rather than stacked on: the modal is about to close, and a
 * leftover entry would cost a dead Back press.
 */
export function pushTab(tab: string): void {
  const state = { mobuIdx: historyIndex() + 1 };
  if (navState().mobuOverlay != null) {
    window.history.replaceState(state, '', `#/${tab}`);
  } else {
    window.history.pushState(state, '', `#/${tab}`);
  }
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
 * to (already on Home), so the caller can minimise instead of exiting.
 */
export function goBack(hasOpenOverlay: boolean, goHome: () => boolean): boolean {
  // An open modal/sheet owns a history entry; popping it closes it.
  if (hasOpenOverlay || historyIndex() > 0) {
    window.history.back();
    return true;
  }
  // First screen of this launch but not Home (a restored screen): Home is "back".
  return goHome();
}
