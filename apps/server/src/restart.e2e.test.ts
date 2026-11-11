import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openStore, type Store } from './store.js';
import { World } from './world.js';
import { createGymServer } from './http.js';
import { newPass } from './passes.js';

/** One running gym server on a fixed database file. */
type Running = { store: Store; world: World; port: number; close: () => Promise<void> };

/** Starts a gym on `dbPath`, on `port` (0 picks a free one). */
const start = async (dbPath: string, port = 0): Promise<Running> => {
  const store = openStore(dbPath);
  const world = new World(store, { now: () => Date.now() }, { waitMaxMs: 200 });
  const gym = createGymServer(world, store);
  await new Promise<void>((r) => gym.server.listen(port, '127.0.0.1', () => r()));
  return { store, world, port: (gym.server.address() as AddressInfo).port, close: async () => { await gym.close(); store.close(); } };
};

/** Calls a tool and returns its text and whether it was an error. */
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { error: res.isError === true, text: (res.content as { type: string; text: string }[])[0]!.text };
};

let dir = '';
let running: Running | null = null;

afterEach(async () => {
  await running?.close();
  running = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('a server restart in the middle of a visit', () => {
  it('keeps the agent connected and tells it how to get back in', async () => {
    dir = mkdtempSync(join(tmpdir(), 'bmx-restart-'));
    const dbPath = join(dir, 'gym.sqlite');
    running = await start(dbPath);
    const { pass, hash } = newPass();
    const agent = running.store.createAgent({ ownerId: running.store.ensureOwner('tester', 0), name: 'Resty', model: 'claude-sonnet-4-6', passHash: hash, now: 0 });

    const client = new Client({ name: 'test-agent', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${pass}` } } }));
    expect((await call(client, 'enter_gym')).error).toBe(false);

    // Redeploy: the old process goes away, a new one opens the same database on the same port.
    const port = running.port;
    await running.close();
    // Let the client notice its kept-alive socket closed (in production a proxy holds that socket instead).
    await new Promise((r) => setTimeout(r, 50));
    running = await start(dbPath, port);

    // The same client, still holding its old session id, gets a useful answer rather than "Unknown session".
    const after = await call(client, 'look_around');
    expect(after.error).toBe(true);
    expect(after.text).toContain('restarted');
    expect(after.text).toContain('enter_gym');

    // It walks back in on the same connection and carries on.
    expect((await call(client, 'enter_gym')).error).toBe(false);
    expect(running.world.isInGym(agent.id)).toBe(true);
    expect((await call(client, 'look_around')).error).toBe(false);

    // The cut-short visit is closed and doesn't use up one of the day's counted visits.
    expect(running.store.countedVisitsSince(agent.id, 0)).toBe(1);
    await client.close();
  });

  it('still says "enter_gym first" to agents that were never in', async () => {
    dir = mkdtempSync(join(tmpdir(), 'bmx-restart-'));
    running = await start(join(dir, 'gym.sqlite'));
    const { hash } = newPass();
    const agent = running.store.createAgent({ ownerId: running.store.ensureOwner('tester', 0), name: 'Newbie', model: 'm', passHash: hash, now: 0 });
    expect(() => running!.world.beginCall(agent.id)).toThrow('You are not in the gym. Call enter_gym first.');
  });
});
