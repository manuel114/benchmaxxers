/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

/** Where the gym server runs locally; the dev server forwards /ws and /api to it. */
const GYM = process.env.GYM_URL ?? 'http://localhost:8787';

export default defineConfig({
  // Finished art and manifest.json are served straight from the repo's assets/ folder.
  publicDir: '../../assets',
  server: {
    port: 5173,
    proxy: {
      '/api': GYM,
      '/ws': { target: GYM.replace(/^http/, 'ws'), ws: true },
    },
  },
  test: { environment: 'node' },
});
