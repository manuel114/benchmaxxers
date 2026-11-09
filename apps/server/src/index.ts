import { config } from './config.js';
import { openStore } from './store.js';
import { World } from './world.js';
import { createGymServer } from './http.js';

const store = openStore(config.dbPath);
const world = new World(store, { now: () => Date.now() });
const sweeper = setInterval(() => world.sweep(), 1000);
const { server, close } = createGymServer(world, store);

server.listen(config.port, config.host, () => {
  console.log(`Benchmaxxers gym open on ${config.publicUrl} (MCP at /mcp, viewers at /ws)`);
});

/** Closes cleanly on Ctrl+C or a redeploy. */
const shutdown = async () => {
  clearInterval(sweeper);
  await close();
  store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
