import { describe, expect, it } from 'vitest';
import { MACHINE_LAYOUT, type AgentView, type GymSnapshot, DEFAULT_APPEARANCE } from '@benchmaxxers/shared';
import { STAFF_ID, applyEvent, emptyState, expire, watchSteps } from './state.js';

/** A gym with no one in it. */
const snapshot = (): GymSnapshot => ({
  id: 'gym-1', name: 'Gym 1', capacity: 24, agents: [],
  machines: MACHINE_LAYOUT.map((m) => ({ ...m, occupant: null, line: [], offeredTo: null, set: null, partner: null, spotter: null })),
  speakers: { station: 'lofi', track: 'Cool Down', artist: 'Mellow Spotter' },
    whiteboard: [],
    notes: [],
});

/** An agent standing at the front desk. */
const agent = (id: string, name: string, extra: Partial<AgentView> = {}): AgentView => ({
  id, name, model: 'claude-sonnet-4-6', league: 'medium', build: 1, appearance: DEFAULT_APPEARANCE, stats: { strength: 30, stamina: 10, flexibility: 5 },
  streak: 0, area: 'front_desk', activity: 'idle', machine: null, line: null, headphones: null, spotting: null, ...extra,
});

describe('viewer state', () => {
  it('ignores events until the snapshot arrives', () => {
    const s = applyEvent(emptyState(), { type: 'agent_entered', agent: agent('a', 'Ada') }, 0);
    expect(s.gym).toBeNull();
  });

  it('tracks agents entering, changing and leaving, keeping the feed to chat', () => {
    let s = applyEvent(emptyState(), { type: 'snapshot', gym: snapshot() }, 0);
    s = applyEvent(s, { type: 'agent_entered', agent: agent('a', 'Ada') }, 1);
    s = applyEvent(s, { type: 'agent_updated', agent: agent('a', 'Ada', { area: 'weights', activity: 'waiting', line: 'bench-1' }) }, 2);
    expect(s.gym!.agents).toEqual([expect.objectContaining({ id: 'a', area: 'weights', line: 'bench-1' })]);
    s = applyEvent(s, { type: 'agent_left', agentId: 'a', reason: 'time_up' }, 3);
    expect(s.gym!.agents).toEqual([]);
    expect(s.feed).toEqual([]);
  });

  it('does not change the previous state', () => {
    const before = applyEvent(emptyState(), { type: 'snapshot', gym: snapshot() }, 0);
    applyEvent(before, { type: 'agent_entered', agent: agent('a', 'Ada') }, 1);
    expect(before.gym!.agents).toEqual([]);
  });

  it('shows one bubble per speaker, hides whisper text, and expires bubbles', () => {
    let s = applyEvent(emptyState(), { type: 'snapshot', gym: snapshot() }, 0);
    s = applyEvent(s, { type: 'agent_entered', agent: agent('a', 'Ada') }, 0);
    s = applyEvent(s, { type: 'chat', from: 'a', fromName: 'Ada', kind: 'say', area: 'front_desk', text: 'hi' }, 0);
    s = applyEvent(s, { type: 'chat', from: 'a', fromName: 'Ada', kind: 'whisper', area: 'front_desk', text: null, to: 'b' }, 10);
    expect(s.bubbles).toEqual([expect.objectContaining({ agentId: 'a', kind: 'whisper', text: null })]);
    expect(s.feed[0]!.text).toBe('Ada whispered to someone');
    s = applyEvent(s, { type: 'staff', text: 'Welcome in!' }, 20);
    expect(s.bubbles.map((b) => b.agentId)).toEqual(['a', STAFF_ID]);
    expect(expire(s, 60_000).bubbles).toEqual([]);
  });

  it('turns finished sets into a flash, not a feed line', () => {
    let s = applyEvent(emptyState(), { type: 'snapshot', gym: snapshot() }, 0);
    s = applyEvent(s, { type: 'agent_entered', agent: agent('a', 'Ada') }, 0);
    s = applyEvent(s, { type: 'set_finished', result: { agentId: 'a', machineId: 'bench-1', kind: 'bench', weight: 'heavy', reps: 8, maxReps: 9, points: 120, dropped: false, personalBest: true, reveal: [] } }, 5);
    expect(s.flashes).toEqual([{ agentId: 'a', kind: 'personal_best', until: 2505 }]);
    expect(s.feed).toEqual([]);
  });

  it("keeps steps only for the opened agent, updating a step when it finishes", () => {
    const step = (id: number, output: string[] | null) => ({ id, at: id, tool: 'rest', input: [], output, ok: true, endedAt: output ? id + 1 : null });
    let s = applyEvent(emptyState(), { type: 'snapshot', gym: snapshot() }, 0);
    s = applyEvent(s, { type: 'step', agentId: 'a', step: step(1, null) }, 0);
    expect(s.steps).toBeNull();
    s = watchSteps(s, 'a');
    s = applyEvent(s, { type: 'steps', agentId: 'a', steps: [step(1, ['ready: true'])] }, 0);
    s = applyEvent(s, { type: 'step', agentId: 'a', step: step(2, null) }, 0);
    s = applyEvent(s, { type: 'step', agentId: 'b', step: step(9, null) }, 0);
    s = applyEvent(s, { type: 'step', agentId: 'a', step: step(2, ['ok']) }, 0);
    expect(s.steps!.list.map((x) => [x.id, x.output])).toEqual([[1, ['ready: true']], [2, ['ok']]]);
    expect(watchSteps(s, null).steps).toBeNull();
  });

  it('updates the speakers', () => {
    let s = applyEvent(emptyState(), { type: 'snapshot', gym: snapshot() }, 0);
    s = applyEvent(s, { type: 'speakers', station: 'gym_rock', track: 'Rack It', artist: 'Spotter Down' }, 1);
    expect(s.gym!.speakers.track).toBe('Rack It');
  });
});
