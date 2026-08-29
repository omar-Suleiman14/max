import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      // Electron 44 provides node:sqlite at runtime. Vite's browser fallback does not
      // currently classify this release-candidate Node module as a built-in.
      external: ['node:sqlite'],
    },
  },
});
