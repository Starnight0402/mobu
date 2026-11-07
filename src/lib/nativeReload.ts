import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { checkForUpdate } from './swUpdate';

// A native permission dialog (camera/mic for calls, location, etc.) pauses
// and resumes the host Activity just like actually backgrounding the app
// does, so only treat a resume as "the user came back later" once the pause
// has lasted a while.
const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * The APK is a thin shell pointed at the live site (see capacitor.config.ts)
 * for OTA updates, but Capacitor only re-fetches that page on a cold start:
 * reopening from the background resumes the already-loaded WebView as-is, so
 * without this the app could go stale indefinitely between force-closes.
 *
 * It used to reload on every resume after 5 minutes, which threw away every
 * screen's data, scroll positions and anything half-typed, and made the
 * whole app load again. The data never needed it: Convex reconnects by
 * itself (its overdue inactivity timer fires the moment the app wakes) and
 * the live queries catch up in place. So now it only reloads when there is
 * actually a new deploy to pick up, or when it can't tell because there's no
 * service worker to ask.
 */
export function reloadOnResume() {
  if (!Capacitor.isNativePlatform()) return;
  let pausedAt: number | null = null;

  void App.addListener('pause', () => {
    pausedAt = Date.now();
  });

  void App.addListener('resume', () => {
    const longPause = pausedAt != null && Date.now() - pausedAt > STALE_AFTER_MS;
    pausedAt = null;
    if (!longPause) return;
    void checkForUpdate().then((result) => {
      // 'unknown' after a timeout isn't a reason to yank the screen away from
      // someone who has started using it: if a new version does arrive, the
      // service worker's controllerchange reload (swUpdate.ts) picks it up at
      // the next idle moment.
      if (result === 'new' || result === 'unsupported') window.location.reload();
    });
  });
}
