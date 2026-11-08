import { defineConfig, devices } from '@playwright/test';

const BACKEND = 'http://127.0.0.1:3210';
const APP = 'http://127.0.0.1:4173';
// Set by the post-deploy smoke test: run read-only specs against the live
// site instead of booting a local backend and build.
const LIVE = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  // Specs share one backend and build on each other's accounts.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: LIVE ?? APP,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The PWA service worker caches aggressively; keep every run on fresh code.
    serviceWorkers: 'block',
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  webServer: LIVE ? undefined : [
    {
      command: 'node scripts/e2e-backend.mjs',
      url: 'http://127.0.0.1:3299',
      timeout: 300_000,
      // Never reuse: a fresh backend is what guarantees a clean database.
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      // The real production build, pointed at the local backend, in its own
      // outDir so dist/ (which Capacitor syncs from) is never overwritten.
      command: 'npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port 4173 --strictPort --host 127.0.0.1',
      url: APP,
      timeout: 300_000,
      reuseExistingServer: false,
      env: { VITE_CONVEX_URL: BACKEND, VITE_GOOGLE_MAPS_API_KEY: '' },
    },
  ],
});
