import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mobu.app',
  appName: 'Mobu',
  webDir: 'dist',
  backgroundColor: '#000000',
  // OTA updates: the APK is a thin shell that always loads the live
  // GitHub Pages deployment instead of a bundled snapshot. Every push to
  // main (see .github/workflows/deploy.yml) updates the app on next
  // launch/reload with no APK rebuild. Trade-off: there's no automatic
  // fallback — Capacitor doesn't serve `webDir` when `server.url` is set,
  // so the app needs a network connection to load at all.
  server: {
    url: 'https://starnight0402.github.io/mobu/',
    androidScheme: 'https',
  },
};

export default config;
