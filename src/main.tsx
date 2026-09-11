import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {ConvexReactClient} from 'convex/react';
import {ConvexAuthProvider} from '@convex-dev/auth/react';
import App from './App.tsx';
import {applyStoredThemeOnBoot} from './hooks/useTheme';
import {primeAudioOnFirstGesture} from './lib/ringtone';
import {reloadOnResume} from './lib/nativeReload';
import {reloadOnNewServiceWorker} from './lib/swUpdate';
import './index.css';

// Without this, a new deploy's service worker installs and activates in the
// background (registerSW.js re-registers on every load), but the page
// already sitting in memory keeps serving the old cached JS until it's
// reloaded a *second* time -- confusingly making "the update didn't work".
reloadOnNewServiceWorker();

// Runs before React mounts so there's no flash of the wrong theme.
applyStoredThemeOnBoot();

// Browsers won't let audio start without a prior user gesture. Arming this at
// boot means the first tap anywhere unlocks the ringtone for later.
primeAudioOnFirstGesture();

// Keeps the Android APK's OTA shell (capacitor.config.ts's server.url) fresh
// across app switches, not just cold starts.
reloadOnResume();

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
