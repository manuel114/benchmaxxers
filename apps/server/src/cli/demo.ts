/**
 * A demo gym for building the viewer: the real server, plus bot agents that
 * walk the real World (no AI, no MCP). They queue, lift, chat and come and
 * go, so `pnpm dev:viewer` has something to show. Local use only: the bots
 * read the answers with `peekAnswers`, which is never exposed over the network.
 *
 *   pnpm dev:demo                 # 8 bots on http://localhost:8787
 *   DEMO_BOTS=20 pnpm dev:demo    # more
 */
import { AREAS, MACHINE_KINDS, STATIONS, type AreaId, type Weight } from '@benchmaxxers/shared';
import { config } from '../config.js';
import { openStore, type AgentRecord } from '../store.js';
import { World, GymError } from '../world.js';
import { createGymServer } from '../http.js';
import { newPass } from '../passes.js';

/** Bot names and the models they pretend to be. */
const BOTS: [string, string][] = [
  ['Clawd', 'claude-sonnet-4-6'], ['Opie', 'claude-opus-4-8'], ['Haiku Hank', 'claude-haiku-4-5'], ['Codey', 'gpt-5-codex'],
  ['Gemma Lift', 'gemini-2.5-pro'], ['Mini Max', 'gpt-5-mini'], ['Llamar', 'llama-4-70b'], ['Quill', 'qwen-3-32b'],
  ['Deep Squat', 'deepseek-v3'], ['Flashy', 'gemini-2.5-flash'], ['Sonny', 'claude-sonnet-4-6'], ['Nano Nate', 'gpt-5-nano'],
];

/** Things bots say between sets. Plain gym talk that passes the chat filter. */
const LINES = [
  'Anyone using bench-2 after this?', 'Leg day was yesterday, I promise.', 'This treadmill playlist slaps.',
  'Light set first, then we go heavy.', 'Who left the dumbbells out?', 'New PB incoming, watch this.',
  'Water break, back in a bit.', 'Spot me? Kidding, I got it.', 'Downward dog is harder than it looks.',
  'How many sets you got left?', 'Nice form on that last one!', 'The cooler line is the real queue.',
];

/** Fraction of answers each bot gets right, so results vary. */
const ACCURACY = [0.95, 0.85, 0.7, 0.9, 0.8, 0.6, 0.75, 0.88, 0.92, 0.65, 0.8, 0.55];

const botCount = Math.max(1, Math.min(BOTS.length * 2, Number(process.env.DEMO_BOTS ?? 8)));
const store = openStore(':memory:');
const world = new World(store, { now: () => Date.now() });
const sweeper = setInterval(() => world.sweep(), 1000);
const { server, close } = createGymServer(world, store, { publicUrl: config.publicUrl, staticDir: config.staticDir });

/** Waits a number of milliseconds. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A random whole number from min to max. */
const between = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

/** A random item from a list. */
const any = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

let stopping = false;

/** Runs one bot forever: visit, rest, visit again. */
const runBot = async (index: number): Promise<void> => {
  const [baseName, model] = BOTS[index % BOTS.length]!;
  const name = index < BOTS.length ? baseName : `${baseName} ${Math.floor(index / BOTS.length) + 1}`;
  const owner = store.ensureOwner('demo', Date.now());
  const agent = store.createAgent({ ownerId: owner, name, model, passHash: newPass().hash, now: Date.now() });
  // Give bots a head start so the four builds all show up.
  const kick = [0, 600, 1500, 3000][index % 4]!;
  if (kick) store.addPoints(agent.id, 'strength', kick);
  agent.points.strength += kick;
  const accuracy = ACCURACY[index % ACCURACY.length]!;

  await sleep(index * 1500);
  while (!stopping) {
    try {
      await visit(agent.id, () => store.agentById(agent.id)!, accuracy);
    } catch (err) {
      if (!(err instanceof GymError)) console.error(`[demo] ${name}:`, err);
    }
    if (world.isInGym(agent.id)) world.leave(agent.id, 'left');
    await sleep(between(15_000, 45_000));
  }
};

/** One visit: a few sets with chat and breaks, then leave. */
const visit = async (agentId: string, record: () => AgentRecord, accuracy: number): Promise<void> => {
  /** Counts a "tool call" like a real agent; false when the visit has ended. */
  const call = () => world.isInGym(agentId) && world.beginCall(agentId).ended === null && world.isInGym(agentId);
  world.enter(record(), 'demo');
  await sleep(between(1500, 4000));
  const sets = between(2, 5);

  for (let done = 0; done < sets && !stopping; done++) {
    if (!call()) return;
    const kind = any(MACHINE_KINDS);
    let turn: Awaited<ReturnType<World['waitForTurn']>> | null = null;
    for (let tries = 0; tries < 4; tries++) {
      if (!call()) return;
      try { turn = await world.waitForTurn(agentId, kind); } catch { turn = null; break; }
      if (turn.status === 'your_turn' || turn.status !== 'waiting') break;
      if (Math.random() < 0.3 && call()) { try { world.speak(agentId, 'say', any(LINES)); } catch { /* cooldown */ } }
    }
    if (!turn || turn.status !== 'your_turn') continue;

    await sleep(between(800, 2500));
    if (!call()) return;
    const weight: Weight = any(['light', 'medium', 'medium', 'heavy'] as const);
    let set: ReturnType<World['startSet']>;
    try { set = world.startSet(agentId, turn.machine, weight); } catch { continue; }
    for (;;) {
      await sleep(between(1500, 4500));
      const answers = world.peekAnswers(agentId);
      if (!answers || !call()) break;
      const given = answers.map((a) => (Math.random() < accuracy ? a : 'pass'));
      const res = world.answerSet(agentId, set.set_id, given);
      if (res.status === 'set_done') break;
    }

    // Between sets: maybe chat, music or a water break.
    await sleep(between(1000, 3000));
    if (!call()) return;
    const roll = Math.random();
    try {
      if (roll < 0.35) world.speak(agentId, Math.random() < 0.1 ? 'shout' : 'say', any(LINES));
      else if (roll < 0.5) world.headphones(agentId, Math.random() < 0.7 ? any(STATIONS).id : null);
      else if (roll < 0.7) { world.walkTo(agentId, 'water_cooler'); await sleep(between(4000, 9000)); }
      else if (roll < 0.78) world.walkTo(agentId, any(AREAS.filter((a): a is AreaId => a !== 'locker_room')));
    } catch { /* cooldowns and limits are fine */ }
  }
  if (world.isInGym(agentId)) {
    world.walkTo(agentId, 'locker_room');
    await sleep(3000);
  }
};

server.listen(config.port, config.host, () => {
  console.log(`Benchmaxxers DEMO gym on ${config.publicUrl} with ${botCount} bots. Watch it with: pnpm dev:viewer`);
  for (let i = 0; i < botCount; i++) void runBot(i);
});

/** Stops the bots and closes cleanly. */
const shutdown = async () => {
  stopping = true;
  clearInterval(sweeper);
  await close();
  store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
