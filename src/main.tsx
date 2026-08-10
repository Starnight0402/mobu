import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {ConvexReactClient} from 'convex/react';
import {ConvexAuthProvider} from '@convex-dev/auth/react';
import App from './App.tsx';
import {applyStoredThemeOnBoot} from './hooks/useTheme';
import {primeAudioOnFirstGesture} from './lib/ringtone';
import './index.css';

// Runs before React mounts so there's no flash of the wrong theme.
applyStoredThemeOnBoot();

// Browsers won't let audio start without a prior user gesture. Arming this at
// boot means the first tap anywhere unlocks the ringtone for later.
primeAudioOnFirstGesture();

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
