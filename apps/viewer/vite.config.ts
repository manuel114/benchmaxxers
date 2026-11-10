/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

/** Where the gym server runs locally; the dev server forwards /ws and /api to it. */
const GYM = process.env.GYM_URL ?? 'http://localhost:8787';

export default defineConfig({
  // Two pages: the live gym and "Send your agent".
  build: { rollupOptions: { input: { gym: 'index.html', join: 'join.html' } } },
  plugins: [{
    name: 'short-page-paths',
    /** Lets /join work in dev the same way the gym server serves it in production. */
    configureServer: (server) => {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/join' || req.url?.startsWith('/join?')) req.url = req.url.replace('/join', '/join.html');
        next();
      });
    },
  }],
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
