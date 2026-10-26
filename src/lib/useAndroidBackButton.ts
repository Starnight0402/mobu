import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { hasOpenOverlay } from './backButtonStack';
import { goBack } from './navigation';

/**
 * Without this, the hardware/gesture back button just exits the app: the app
 * is a single-page SPA, so Capacitor's default "go back in WebView history,
 * else exit" has nothing sensible to do.
 *
 * Back now means: close the open modal/sheet if there is one, otherwise return
 * to the screen you came from (every screen change is a history entry, see
 * navigation.ts), and only when there's nowhere left to go minimise rather
 * than hard-exit, which is how Android apps are expected to behave.
 *
 * `onNavigateHome` should navigate to Home and return true, or return false if
 * already there.
 */
export function useAndroidBackButton(onNavigateHome: () => boolean) {
  const onNavigateHomeRef = useRef(onNavigateHome);
  onNavigateHomeRef.current = onNavigateHome;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = App.addListener('backButton', () => {
      if (goBack(hasOpenOverlay(), () => onNavigateHomeRef.current())) return;
      void App.minimizeApp();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);
}
