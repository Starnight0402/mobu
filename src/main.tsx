import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {ConvexReactClient} from 'convex/react';
import {ConvexAuthProvider} from '@convex-dev/auth/react';
import App from './App.tsx';
import {applyStoredThemeOnBoot} from './hooks/useTheme';
import './index.css';

// Runs before React mounts so there's no flash of the wrong theme.
applyStoredThemeOnBoot();

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
