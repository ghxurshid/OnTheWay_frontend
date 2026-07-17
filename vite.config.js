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
        // NOTE: leaflet + its UMD plugins (ant-path, rotate) must NOT be forced
        // into a manual chunk — the plugins reference the global `L` at eval
        // time, and reordering them ahead of leaflet breaks init ("L is not
        // defined"). Leave them in the import-graph order rollup picks.
        manualChunks: {
          signalr: ['@microsoft/signalr'],
          react: ['react', 'react-dom'],
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
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
});
