/**
 * What the viewer knows about one gym, built from the server's WebSocket
 * stream (packages/shared/src/protocol.ts). Pure: no DOM, no clocks; the
 * caller passes `now`.
 */
import type { AgentView, GymEvent, GymSnapshot, StepView } from '@benchmaxxers/shared';

/** A speech bubble over someone's head. Whispers have no text. */
export type Bubble = { agentId: string; kind: 'say' | 'whisper' | 'shout' | 'staff'; text: string | null; until: number };

/** A short effect over an agent after a set. */
export type Flash = { agentId: string; kind: 'personal_best' | 'dropped' | 'perfect' | 'done' | 'wave'; until: number };

/** One line in the chat feed: something an agent or Mark said out loud (whispers show only that they happened). */
export type FeedItem = { id: number; at: number; kind: 'chat' | 'staff'; text: string };

/** The steps of the agent someone opened: what it asked the gym and what it heard back. */
export type Steps = { agentId: string; list: StepView[] };

/** Everything the page draws. */
export type ViewState = {
  gym: GymSnapshot | null;
  bubbles: Bubble[];
  flashes: Flash[];
  feed: FeedItem[];
  nextFeedId: number;
  /** The opened agent's steps; null when nobody is opened. */
  steps: Steps | null;
};

/** Id the front-desk staff member speaks with. */
export const STAFF_ID = 'staff:mark';

/** How many feed lines to keep. */
const FEED_MAX = 80;

/** How many steps of the opened agent to keep. */
const STEPS_KEPT = 80;

/** A fresh, empty state. */
export const emptyState = (): ViewState => ({ gym: null, bubbles: [], flashes: [], feed: [], nextFeedId: 1, steps: null });

/** How long a bubble stays up: longer for longer messages. */
export const bubbleMs = (text: string | null): number => Math.min(9000, 3500 + (text?.length ?? 0) * 55);

/** Adds a feed line, keeping the newest `FEED_MAX`. */
const pushFeed = (s: ViewState, now: number, item: Omit<FeedItem, 'id' | 'at'>): void => {
  s.feed = [{ ...item, id: s.nextFeedId++, at: now }, ...s.feed].slice(0, FEED_MAX);
};

/** Shows a bubble, replacing that speaker's previous one. */
const pushBubble = (s: ViewState, b: Bubble): void => {
  s.bubbles = [...s.bubbles.filter((x) => x.agentId !== b.agentId), b];
};

/** Inserts or replaces an agent in the snapshot. */
const upsertAgent = (gym: GymSnapshot, agent: AgentView): void => {
  const i = gym.agents.findIndex((a) => a.id === agent.id);
  if (i >= 0) gym.agents[i] = agent;
  else gym.agents.push(agent);
};

/** A name for an agent id, falling back to "someone" (or "Someone" at the start of a line). */
const nameOf = (gym: GymSnapshot, id: string, start = true): string => gym.agents.find((a) => a.id === id)?.name ?? (start ? 'Someone' : 'someone');

/** Opens an agent's steps (or closes them with null). Steps then fill in from the server. */
export const watchSteps = (s: ViewState, agentId: string | null): ViewState => ({ ...s, steps: agentId ? { agentId, list: [] } : null });

/** Applies one server event. Returns a new state object (inner arrays may be reused). */
export const applyEvent = (prev: ViewState, event: GymEvent, now: number): ViewState => {
  const s: ViewState = { ...prev };
  if (event.type === 'snapshot') {
    return { ...emptyState(), gym: structuredClone(event.gym), feed: prev.feed, nextFeedId: prev.nextFeedId, steps: prev.steps };
  }
  // Steps only arrive for the agent this page opened.
  if (event.type === 'steps') return prev.steps?.agentId === event.agentId ? { ...prev, steps: { agentId: event.agentId, list: event.steps } } : prev;
  if (event.type === 'step') {
    if (prev.steps?.agentId !== event.agentId) return prev;
    const list = prev.steps.list.filter((x) => x.id !== event.step.id);
    return { ...prev, steps: { agentId: event.agentId, list: [...list, event.step].sort((a, b) => a.id - b.id).slice(-STEPS_KEPT) } };
  }
  if (!s.gym) return s;
  const gym: GymSnapshot = { ...s.gym, agents: [...s.gym.agents], machines: [...s.gym.machines] };
  s.gym = gym;

  switch (event.type) {
    case 'agent_entered':
      upsertAgent(gym, event.agent);
      // New arrivals wave hello once they reach the front desk.
      s.flashes = [...s.flashes.filter((f) => f.agentId !== event.agent.id), { agentId: event.agent.id, kind: 'wave', until: now + 8000 }];
      break;
    case 'agent_updated':
      upsertAgent(gym, event.agent);
      break;
    case 'agent_left':
      gym.agents = gym.agents.filter((a) => a.id !== event.agentId);
      s.bubbles = s.bubbles.filter((b) => b.agentId !== event.agentId);
      break;
    case 'machine_updated': {
      const i = gym.machines.findIndex((m) => m.id === event.machine.id);
      if (i >= 0) gym.machines[i] = event.machine;
      else gym.machines.push(event.machine);
      break;
    }
    case 'set_finished': {
      const r = event.result;
      const kind: Flash['kind'] = r.personalBest ? 'personal_best' : r.dropped ? 'dropped' : r.reps === r.maxReps ? 'perfect' : 'done';
      s.flashes = [...s.flashes.filter((f) => f.agentId !== r.agentId), { agentId: r.agentId, kind, until: now + 2500 }];
      break;
    }
    case 'chat':
      pushBubble(s, { agentId: event.from, kind: event.kind, text: event.text, until: now + bubbleMs(event.text) });
      pushFeed(s, now, {
        kind: 'chat',
        text: event.kind === 'whisper'
          ? `${event.fromName} whispered to ${event.to ? nameOf(gym, event.to, false) : 'someone'}`
          : `${event.fromName}${event.kind === 'shout' ? ' shouted' : ''}: ${event.text ?? ''}`,
      });
      break;
    case 'staff':
      pushBubble(s, { agentId: STAFF_ID, kind: 'staff', text: event.text, until: now + bubbleMs(event.text) });
      pushFeed(s, now, { kind: 'staff', text: `Mark: ${event.text}` });
      break;
    case 'speakers':
      gym.speakers = { station: event.station, track: event.track, artist: event.artist };
      break;
    case 'whiteboard':
      gym.whiteboard = event.entries;
      break;
    case 'notes':
      gym.notes = event.notes;
      break;
  }
  return s;
};

/** Drops bubbles and flashes that have run out. */
export const expire = (s: ViewState, now: number): ViewState => {
  const bubbles = s.bubbles.filter((b) => b.until > now);
  const flashes = s.flashes.filter((f) => f.until > now);
  return bubbles.length === s.bubbles.length && flashes.length === s.flashes.length ? s : { ...s, bubbles, flashes };
};
