import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Single `@` alias → `src`. Keeps imports readable across the layered
// architecture (e.g. `@/services/walkerService`) and avoids `../../..` chains.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing vendors into their own long-cacheable
        // chunks so the app chunk stays small and app edits don't bust them.
        // Matching by path (not entry name) also catches `react-dom/client` and
        // `scheduler`, which an entry list would leave in the app chunk.
        // NOTE: leaflet + its UMD plugins (ant-path, rotate) must NOT be forced
        // into a manual chunk — the plugins reference the global `L` at eval
        // time, and reordering them ahead of leaflet breaks init ("L is not
        // defined"). Leave them in the import-graph order rollup picks.
        manualChunks(id) {
          if (id.includes('/node_modules/@microsoft/signalr/')) return 'signalr';
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
  },
});
