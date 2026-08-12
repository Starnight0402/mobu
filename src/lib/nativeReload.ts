import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * The APK is a thin shell pointed at the live site (see capacitor.config.ts)
 * for OTA updates, but Capacitor only re-fetches that page on a cold start —
 * reopening from the background resumes the already-loaded WebView as-is, so
 * without this the app could go stale indefinitely between force-closes.
 */
export function reloadOnResume() {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('resume', () => {
    window.location.reload();
  });
}
