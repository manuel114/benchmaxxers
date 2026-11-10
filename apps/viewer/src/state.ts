/**
 * What the viewer knows about one gym, built from the server's WebSocket
 * stream (packages/shared/src/protocol.ts). Pure: no DOM, no clocks; the
 * caller passes `now`.
 */
import type { AgentView, GymEvent, GymSnapshot, MachineKind, SetResult } from '@benchmaxxers/shared';

/** A speech bubble over someone's head. Whispers have no text. */
export type Bubble = { agentId: string; kind: 'say' | 'whisper' | 'shout' | 'staff'; text: string | null; until: number };

/** A short effect over an agent after a set. */
export type Flash = { agentId: string; kind: 'personal_best' | 'dropped' | 'perfect' | 'done'; until: number };

/** One line in the activity feed. */
export type FeedItem = { id: number; at: number; kind: 'chat' | 'staff' | 'set' | 'enter' | 'leave'; text: string; result?: SetResult };

/** Everything the page draws. */
export type ViewState = {
  gym: GymSnapshot | null;
  bubbles: Bubble[];
  flashes: Flash[];
  feed: FeedItem[];
  nextFeedId: number;
};

/** Id the front-desk staff member speaks with. */
export const STAFF_ID = 'staff:mark';

/** How many feed lines to keep. */
const FEED_MAX = 80;

/** Words for each machine in the feed. */
const DID: Record<MachineKind, string> = { bench: 'benched', treadmill: 'ran', yoga_mat: 'held a pose' };

/** Why an agent left, in words. */
const LEFT: Record<string, string> = { left: 'headed home', time_up: 'ran out of time', idle: 'wandered off', walked_out: 'was walked out by staff' };

/** A fresh, empty state. */
export const emptyState = (): ViewState => ({ gym: null, bubbles: [], flashes: [], feed: [], nextFeedId: 1 });

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

/** Applies one server event. Returns a new state object (inner arrays may be reused). */
export const applyEvent = (prev: ViewState, event: GymEvent, now: number): ViewState => {
  const s: ViewState = { ...prev };
  if (event.type === 'snapshot') {
    return { ...emptyState(), gym: structuredClone(event.gym), feed: prev.feed, nextFeedId: prev.nextFeedId };
  }
  if (!s.gym) return s;
  const gym: GymSnapshot = { ...s.gym, agents: [...s.gym.agents], machines: [...s.gym.machines] };
  s.gym = gym;

  switch (event.type) {
    case 'agent_entered':
      upsertAgent(gym, event.agent);
      pushFeed(s, now, { kind: 'enter', text: `${event.agent.name} (${event.agent.model}) walked in` });
      break;
    case 'agent_updated':
      upsertAgent(gym, event.agent);
      break;
    case 'agent_left': {
      const name = nameOf(gym, event.agentId);
      gym.agents = gym.agents.filter((a) => a.id !== event.agentId);
      s.bubbles = s.bubbles.filter((b) => b.agentId !== event.agentId);
      pushFeed(s, now, { kind: 'leave', text: `${name} ${LEFT[event.reason] ?? 'left'}` });
      break;
    }
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
      const extra = r.dropped ? ' and dropped the bar' : r.personalBest ? ', a personal best!' : '';
      pushFeed(s, now, { kind: 'set', text: `${nameOf(gym, r.agentId)} ${DID[r.kind]} ${r.weight}: ${r.reps}/${r.maxReps} reps, +${r.points} pts${extra}`, result: r });
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
  }
  return s;
};

/** Drops bubbles and flashes that have run out. */
export const expire = (s: ViewState, now: number): ViewState => {
  const bubbles = s.bubbles.filter((b) => b.until > now);
  const flashes = s.flashes.filter((f) => f.until > now);
  return bubbles.length === s.bubbles.length && flashes.length === s.flashes.length ? s : { ...s, bubbles, flashes };
};
