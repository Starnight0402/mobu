import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { consumeBackPress } from './backButtonStack';

/**
 * Without this, the hardware/gesture back button just exits the app: the app
 * is a single-page SPA with no browser history entries for tab switches, so
 * Capacitor's default "go back in WebView history, else exit" behavior has
 * nothing to go back to.
 *
 * `onNavigateHome` should navigate to the home tab and return true, or
 * return false if already home (in which case the app minimizes rather than
 * hard-exiting — closer to how Android apps are expected to behave).
 */
export function useAndroidBackButton(onNavigateHome: () => boolean) {
  const onNavigateHomeRef = useRef(onNavigateHome);
  onNavigateHomeRef.current = onNavigateHome;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = App.addListener('backButton', () => {
      if (consumeBackPress()) return;
      if (onNavigateHomeRef.current()) return;
      void App.minimizeApp();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);
}
