import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { hasOpenOverlay, isBackBlocked } from './backButtonStack';
import { goBack } from './navigation';

/**
 * Without this, the hardware/gesture back button just exits the app: the app
 * is a single-page SPA, so Capacitor's default "go back in WebView history,
 * else exit" has nothing sensible to do.
 *
 * Back now means: nothing during a call (it has its own Hang up / Decline),
 * else close the open modal/sheet if there is one, else return to the screen
 * you came from (every screen change is a history entry, see navigation.ts),
 * and on Home minimise rather than hard-exit, which is how Android apps are
 * expected to behave.
 *
 * `onHome` says whether Home is showing; `goHome` must move there without
 * adding a history entry.
 */
export function useAndroidBackButton(onHome: boolean, goHome: () => void) {
  const stateRef = useRef({ onHome, goHome });
  stateRef.current = { onHome, goHome };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = App.addListener('backButton', () => {
      if (isBackBlocked()) return;
      const { onHome: home, goHome: toHome } = stateRef.current;
      if (goBack(hasOpenOverlay(), home, toHome)) return;
      void App.minimizeApp();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);
}
