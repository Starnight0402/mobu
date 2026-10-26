import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default {
  root: path.resolve(__dirname, '..'),
  plugins: [react(), tailwindcss()],
  optimizeDeps: { entries: ['_h/index.html'] },
  resolve: { alias: [
    { find: /^\.\/NotificationProvider$/, replacement: path.resolve(__dirname, 'stub.tsx') },
    { find: /^convex\/react$/, replacement: path.resolve(__dirname, 'convex-stub.ts') },
  ] },
};
