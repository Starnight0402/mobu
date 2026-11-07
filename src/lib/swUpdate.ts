/**
 * The service worker (registerType: 'autoUpdate', skipWaiting + clientsClaim
 * in src/sw.ts) installs and takes control of the page as soon as a new
 * version is fetched, but the JS already running in this tab doesn't swap
 * itself out. Reloading once here means a deploy shows up on the next app
 * open instead of needing it opened twice.
 *
 * The reload must never land while someone is mid-task: it used to fire the
 * instant a new deploy took control, wiping a half-typed description or a
 * memory being set up. So it waits until the user isn't in a text field or a
 * call, or until the app is backgrounded (when a reload is invisible).
 */
/**
 * Asks the server whether a newer deploy exists. 'unsupported' when there's
 * no service worker to ask; 'unknown' when it didn't answer in time.
 */
export async function checkForUpdate(
  timeoutMs = 4000,
): Promise<'new' | 'current' | 'unknown' | 'unsupported'> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'unsupported';
    const timedOut = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), timeoutMs));
    if ((await Promise.race([reg.update().then(() => 'done' as const), timedOut])) === 'timeout') return 'unknown';
    return reg.installing || reg.waiting ? 'new' : 'current';
  } catch {
    return 'unknown';
  }
}

export function reloadOnNewServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // First-ever visit: the worker claims the page but there's no stale JS to
  // replace, so reloading would just flash the app for nothing.
  const hadController = !!navigator.serviceWorker.controller;
  let pending = false;

  const busy = () => {
    const el = document.activeElement;
    const typing =
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLElement && el.isContentEditable);
    return typing || !!document.querySelector('[data-no-auto-reload]');
  };

  const reloadWhenIdle = () => {
    if (!pending) return;
    if (document.visibilityState === 'hidden' || !busy()) {
      pending = false;
      window.location.reload();
    }
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || pending) return;
    pending = true;
    reloadWhenIdle();
  });

  document.addEventListener('visibilitychange', reloadWhenIdle);
  // focusout fires as the keyboard closes / the field blurs.
  document.addEventListener('focusout', () => setTimeout(reloadWhenIdle, 300));
}
