/**
 * The service worker (registerType: 'autoUpdate', skipWaiting + clientsClaim
 * in src/sw.ts) installs and takes control of the page as soon as a new
 * version is fetched, but the JS already running in this tab doesn't swap
 * itself out. Reloading once here means a deploy shows up on the next app
 * open instead of needing it opened twice.
 */
export function reloadOnNewServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
