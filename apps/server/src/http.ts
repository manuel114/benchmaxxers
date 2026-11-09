import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, type WebSocket } from 'ws';
import { MACHINE_KINDS, buildForStrength, statFromPoints, type GymEvent } from '@benchmaxxers/shared';
import type { World } from './world.js';
import type { Store } from './store.js';
import { createGymMcp } from './mcp.js';
import { hashPass, passFromHeader } from './passes.js';

/** One connected agent session. */
type Session = { transport: StreamableHTTPServerTransport; agentId: string };

/** Largest request body accepted, to keep a misbehaving client from filling memory. */
const MAX_BODY_BYTES = 256 * 1024;

/** Reads a JSON request body. */
const readJson = (req: IncomingMessage): Promise<unknown> => new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (c: Buffer) => {
    size += c.length;
    if (size > MAX_BODY_BYTES) { reject(new Error('Request too large')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined); } catch { reject(new Error('Invalid JSON')); }
  });
  req.on('error', reject);
});

/** Sends a JSON response. */
const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
};

/** Starts the gym's HTTP server: MCP for agents, WebSocket and JSON for viewers. */
export const createGymServer = (world: World, store: Store): { server: Server; close: () => Promise<void> } => {
  const sessions = new Map<string, Session>();
  world.setMaxListeners(0);

  /** The agent a request's gym pass belongs to. */
  const agentFor = (req: IncomingMessage) => {
    const pass = passFromHeader(req.headers.authorization);
    return pass ? store.agentByPassHash(hashPass(pass)) : null;
  };

  /** Handles the MCP endpoint (Streamable HTTP, one session per connected agent). */
  const handleMcp = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const agent = agentFor(req);
    if (!agent) return json(res, 401, { error: 'Missing or invalid gym pass. Send it as "Authorization: Bearer bmx_...".' });
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId) {
      const s = sessions.get(sessionId);
      if (!s) return json(res, 404, { error: 'Unknown session. Reconnect.' });
      if (s.agentId !== agent.id) return json(res, 403, { error: 'This session belongs to another agent.' });
      const body = req.method === 'POST' ? await readJson(req) : undefined;
      return s.transport.handleRequest(req, res, body);
    }

    if (req.method !== 'POST') return json(res, 400, { error: 'Start with an initialize request.' });
    const body = await readJson(req);
    if (!isInitializeRequest(body)) return json(res, 400, { error: 'Start with an initialize request.' });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { sessions.set(id, { transport, agentId: agent.id }); },
    });
    transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
    const mcp = createGymMcp(world, () => store.agentById(agent.id), agent.id);
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  };

  /** Public profile of an agent, for the viewer. */
  const profile = (name: string) => {
    const a = store.agentByName(name);
    if (!a) return null;
    const stats = { strength: statFromPoints(a.points.strength), stamina: statFromPoints(a.points.stamina), flexibility: statFromPoints(a.points.flexibility) };
    return {
      name: a.name, model: a.model, league: a.league, stats, build: buildForStrength(stats.strength), streak: a.streak,
      personal_bests: Object.fromEntries(MACHINE_KINDS.map((k) => [k, store.personalBest(a.id, k)])),
      in_gym: world.isInGym(a.id),
    };
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    (async () => {
      if (path === '/mcp') return handleMcp(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET', 'access-control-allow-headers': '*' });
        return res.end();
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
      if (path === '/health') return json(res, 200, { ok: true });
      if (path === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><meta charset="utf-8"><title>Benchmaxxers gym</title><body style="font-family:system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem">
<h1>Benchmaxxers gym server</h1><p>You skip leg day. Your agent doesn't.</p>
<p>Agents connect over MCP at <code>/mcp</code>. Viewers connect over WebSocket at <code>/ws?gym=gym-1</code>.</p>
<ul>${world.gyms.map((g) => `<li><a href="/api/gyms/${g.id}">${g.name}</a>: ${g.agents.size} agent${g.agents.size === 1 ? '' : 's'} in</li>`).join('')}</ul>
<p>The live pixel art gym page is coming. Source: <a href="https://github.com/manuel114/benchmaxxers">github.com/manuel114/benchmaxxers</a></p></body>`);
      }
      if (path === '/api/gyms') return json(res, 200, world.gyms.map((g) => ({ id: g.id, name: g.name, agents: g.agents.size })));
      const gymMatch = path.match(/^\/api\/gyms\/([\w-]+)$/);
      if (gymMatch) {
        const snap = world.snapshot(gymMatch[1]!);
        return snap ? json(res, 200, snap) : json(res, 404, { error: 'No such gym' });
      }
      const agentMatch = path.match(/^\/api\/agents\/([^/]+)$/);
      if (agentMatch) {
        const p = profile(decodeURIComponent(agentMatch[1]!));
        return p ? json(res, 200, p) : json(res, 404, { error: 'No such agent' });
      }
      return json(res, 404, { error: 'Not found' });
    })().catch((err: Error) => {
      if (!res.headersSent) json(res, 500, { error: err.message });
      else res.end();
    });
  });

  // Viewers: /ws?gym=gym-1 gets a snapshot, then every event in that gym.
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const gymId = url.searchParams.get('gym') ?? world.gyms[0]!.id;
    const snap = world.snapshot(gymId);
    if (!snap) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      const sendEvent = (g: string, event: GymEvent) => { if (g === gymId && ws.readyState === ws.OPEN) ws.send(JSON.stringify(event)); };
      ws.send(JSON.stringify({ type: 'snapshot', gym: snap } satisfies GymEvent));
      world.on('event', sendEvent);
      ws.on('close', () => world.off('event', sendEvent));
    });
  });

  return {
    server,
    close: async () => {
      for (const s of sessions.values()) await s.transport.close().catch(() => {});
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
};
