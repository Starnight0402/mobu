import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // Served from the mobu.prismintelligence.in custom domain root (see
  // public/CNAME) — no GitHub Pages "/mobu/" subpath to account for anymore.
  const base = '/';
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // generateSW's workbox-build step writes an intermediate file with
        // unescaped absolute-path import specifiers, which breaks on this
        // machine because the folder name contains an apostrophe. Routing
        // the service worker through Vite's own bundler (injectManifest)
        // avoids that codegen path entirely.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        },
        registerType: 'autoUpdate',
        includeAssets: ['icons/apple-touch-icon.png'],
        manifest: {
          id: base,
          name: 'Mobu — Our Life Together',
          short_name: 'Mobu',
          description: 'A private, real-time archive and life tracker for two.',
          start_url: base,
          scope: base,
          display: 'standalone',
          background_color: '#000000',
          theme_color: '#000000',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
