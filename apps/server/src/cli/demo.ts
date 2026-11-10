/**
 * A demo gym for building the viewer: the real server, plus bot agents that
 * walk the real World (no AI, no MCP). They queue, lift, chat and come and
 * go, so `pnpm dev:viewer` has something to show. Local use only: the bots
 * read the answers with `peekAnswers`, which is never exposed over the network.
 *
 *   pnpm dev:demo                 # 8 bots on http://localhost:8787
 *   DEMO_BOTS=20 pnpm dev:demo    # more
 */
import { AREAS, LIMITS, MACHINE_KINDS, STATIONS, type AreaId, type Weight } from '@benchmaxxers/shared';
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
  /** Runs one gym action as a step, so people who open a bot can follow it like a real agent. */
  const step = <T>(tool: string, input: Record<string, unknown>, fn: () => T | Promise<T>) => world.logged(agentId, tool, input, fn);
  /** Says or shouts a random gym line. */
  const chat = (kind: 'say' | 'shout') => { const text = any(LINES); return step(kind, { text }, () => world.speak(agentId, kind, text)); };
  await step('enter_gym', { goal: 'demo' }, () => world.enter(record(), 'demo'));
  await sleep(between(1500, 4000));
  const exercises = between(2, 3);

  /** Rests until ready, answering any ask for a spot along the way (sometimes). */
  const restUp = async (): Promise<boolean> => {
    for (let i = 0; i < 4; i++) {
      if (!call()) return false;
      let r: Awaited<ReturnType<World['rest']>>;
      try { r = await step('rest', {}, () => world.rest(agentId)); } catch { return true; }
      if ('status' in r) return false;
      const asking = r.asking_for_a_spot?.[0];
      if (asking && Math.random() < 0.6 && call()) {
        try { await step('spot', { name: asking }, () => world.spot(agentId, asking)); await sleep(between(6000, 12_000)); } catch { /* someone else got there first */ }
      }
      if (r.ready) return true;
    }
    return true;
  };

  for (let done = 0; done < exercises && !stopping; done++) {
    if (!call()) return;
    const kind = any(MACHINE_KINDS);
    let machine: string | null = null;
    for (let tries = 0; tries < 4 && !machine; tries++) {
      if (!call()) return;
      let turn: Awaited<ReturnType<World['waitForTurn']>>;
      try { turn = await step('wait_for_turn', { machine: kind }, () => world.waitForTurn(agentId, kind)); } catch { break; }
      if (turn.status === 'your_turn') { machine = turn.machine; break; }
      if (turn.status !== 'waiting') break;
      // Sometimes ask to work in rather than keep waiting, like a real gym.
      if (Math.random() < 0.35 && call()) {
        const busy = turn.machine;
        try { machine = (await step('work_in', { machine: busy }, () => world.workIn(agentId, busy))).machine; } catch { /* no room to work in */ }
      } else if (Math.random() < 0.3 && call()) {
        try { await chat('say'); } catch { /* cooldown */ }
      }
    }
    if (!machine) continue;

    // A few sets on this machine, resting between them.
    const sets = between(1, LIMITS.setsPerTurn);
    for (let n = 0; n < sets && !stopping; n++) {
      await sleep(between(800, 2500));
      if (!call()) return;
      const weight: Weight = any(['light', 'medium', 'medium', 'heavy'] as const);
      if (kind === 'bench' && weight === 'heavy') {
        try { await step('ask_for_spot', {}, () => world.askForSpot(agentId)); } catch { /* lift lighter instead */ }
      }
      let set: Awaited<ReturnType<World['startSetWhenRested']>>;
      const on = machine;
      try { set = await step('start_set', { machine: on, weight }, () => world.startSetWhenRested(agentId, on, weight)); } catch {
        try { set = await step('start_set', { machine: on, weight: 'medium' }, () => world.startSetWhenRested(agentId, on, 'medium')); } catch { break; }
      }
      if ('status' in set && set.status === 'visit_over') return;
      const setId = set.set_id;
      for (;;) {
        await sleep(between(1500, 4500));
        const answers = world.peekAnswers(agentId);
        if (!answers || !call()) break;
        const given = answers.map((a) => (Math.random() < accuracy ? a : 'pass'));
        const res = await step('answer_set', { set_id: setId, answers: given }, () => world.answerSet(agentId, setId, given));
        if (res.status === 'set_done') break;
      }
      if (!(await restUp())) return;
    }

    // Between sets: maybe chat, music or a water break.
    await sleep(between(1000, 3000));
    if (!call()) return;
    const roll = Math.random();
    try {
      if (roll < 0.35) await chat(Math.random() < 0.1 ? 'shout' : 'say');
      else if (roll < 0.5) {
        const station = Math.random() < 0.7 ? any(STATIONS).id : null;
        await (station ? step('put_on_headphones', { station }, () => world.headphones(agentId, station)) : step('take_off_headphones', {}, () => world.headphones(agentId, null)));
      } else if (roll < 0.7) { await step('walk_to', { area: 'water_cooler' }, () => world.walkTo(agentId, 'water_cooler')); await sleep(between(4000, 9000)); }
      else if (roll < 0.78) { const area = any(AREAS.filter((a): a is AreaId => a !== 'locker_room')); await step('walk_to', { area }, () => world.walkTo(agentId, area)); }
    } catch { /* cooldowns and limits are fine */ }
  }
  if (world.isInGym(agentId)) {
    await step('walk_to', { area: 'locker_room' }, () => world.walkTo(agentId, 'locker_room'));
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
