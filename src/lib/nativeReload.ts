import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

// A native permission dialog (camera/mic for calls, location, etc.) pauses
// and resumes the host Activity just like actually backgrounding the app
// does — reloading on every resume was wiping in-progress state (e.g. an
// active call) the instant Android's permission prompt closed. Only treat a
// resume as "the user came back later" once the pause has lasted a while.
const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * The APK is a thin shell pointed at the live site (see capacitor.config.ts)
 * for OTA updates, but Capacitor only re-fetches that page on a cold start —
 * reopening from the background resumes the already-loaded WebView as-is, so
 * without this the app could go stale indefinitely between force-closes.
 */
export function reloadOnResume() {
  if (!Capacitor.isNativePlatform()) return;
  let pausedAt: number | null = null;

  void App.addListener('pause', () => {
    pausedAt = Date.now();
  });

  void App.addListener('resume', () => {
    if (pausedAt != null && Date.now() - pausedAt > STALE_AFTER_MS) {
      window.location.reload();
    }
    pausedAt = null;
  });
}
