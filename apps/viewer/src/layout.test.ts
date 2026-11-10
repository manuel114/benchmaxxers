import { describe, expect, it } from 'vitest';
import { AREA_RECTS, MACHINE_LAYOUT, ROOM, type AgentView, type GymSnapshot, DEFAULT_APPEARANCE } from '@benchmaxxers/shared';
import { ROOM_PX, areaSpot, lineSpot, machineSpot, placeAll, step } from './layout.js';

/** A gym with the standard machines and the given agents. */
const gymWith = (agents: AgentView[], patch: (g: GymSnapshot) => void = () => {}): GymSnapshot => {
  const g: GymSnapshot = {
    id: 'gym-1', name: 'Gym 1', capacity: 24, agents,
    machines: MACHINE_LAYOUT.map((m) => ({ ...m, occupant: null, line: [], offeredTo: null, set: null })),
    speakers: { station: 'lofi', track: 't', artist: 'a' },
  };
  patch(g);
  return g;
};

/** An agent with defaults. */
const agent = (id: string, extra: Partial<AgentView> = {}): AgentView => ({
  id, name: id, model: 'm', league: 'medium', build: 0, appearance: DEFAULT_APPEARANCE, stats: { strength: 0, stamina: 0, flexibility: 0 },
  streak: 0, area: 'front_desk', activity: 'idle', machine: null, line: null, headphones: null, ...extra,
});

describe('layout', () => {
  it('puts someone mid-set on the machine in that machine’s pose', () => {
    const g = gymWith([agent('a', { area: 'cardio', activity: 'lifting', machine: 'treadmill-2' })], (g) => {
      g.machines.find((m) => m.id === 'treadmill-2')!.occupant = 'a';
    });
    const p = placeAll(g).get('a')!;
    expect(p).toMatchObject({ ...machineSpot({ x: 18, y: 3 }), pose: 'run', machineId: 'treadmill-2' });
  });

  it('lines people up in order behind the machine, with the offered turn beside it', () => {
    const g = gymWith([
      agent('next', { area: 'weights', line: 'bench-1' }),
      agent('w1', { area: 'weights', activity: 'waiting', line: 'bench-1' }),
      agent('w2', { area: 'weights', activity: 'waiting', line: 'bench-1' }),
    ], (g) => {
      const m = g.machines.find((x) => x.id === 'bench-1')!;
      m.offeredTo = 'next';
      m.line = ['w2', 'w1'];
    });
    const m = g.machines.find((x) => x.id === 'bench-1')!;
    const places = placeAll(g);
    expect(places.get('w2')).toMatchObject({ ...lineSpot(m, 0), pose: 'wait' });
    expect(places.get('w1')).toMatchObject({ ...lineSpot(m, 1), pose: 'wait' });
    expect(places.get('next')!.pose).toBe('stand');
    expect(places.get('next')!.x).toBeLessThan(machineSpot(m).x);
  });

  it('spreads loiterers out inside their area and inside the room', () => {
    const ids = Array.from({ length: 24 }, (_, i) => `agt_${i}`);
    for (const area of Object.keys(AREA_RECTS) as (keyof typeof AREA_RECTS)[]) {
      const spots = ids.map((id, n) => areaSpot(area, n, id));
      for (const s of spots) {
        expect(s.x).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(ROOM_PX.w);
        expect(s.y).toBeGreaterThan(2 * ROOM.tile);
        expect(s.y).toBeLessThan(ROOM_PX.h);
      }
      const firstFew = new Set(spots.slice(0, 4).map((s) => `${Math.round(s.x / 10)},${Math.round(s.y / 10)}`));
      expect(firstFew.size, area).toBe(4);
    }
    const g = gymWith([agent('a', { area: 'water_cooler', activity: 'resting' })]);
    expect(placeAll(g).get('a')!.pose).toBe('rest');
  });

  it('walks toward a target and snaps when it arrives', () => {
    let m = { x: 0, y: 0, facing: 'down' as const, walking: false };
    const moved = step(m, { x: 100, y: 0 }, 0.5);
    expect(moved).toMatchObject({ x: 36, y: 0, facing: 'right', walking: true });
    m = { ...moved, facing: 'down' as const };
    expect(step(m, { x: 37, y: 0 }, 0.5)).toMatchObject({ x: 37, walking: false });
  });
});

describe('lines', () => {
  it('spaces a full bench or treadmill line so name tags stack without overlapping', () => {
    for (const kind of ['bench', 'treadmill'] as const) {
      const spots = [0, 1, 2, 3].map((n) => lineSpot({ x: 15, y: 3, kind }, n));
      for (let i = 1; i < spots.length; i++) expect(spots[i]!.y - spots[i - 1]!.y).toBeGreaterThanOrEqual(12);
      expect(Math.max(...spots.map((p) => p.y))).toBeLessThan(ROOM_PX.h);
    }
  });

  it('keeps each treadmill line clear of the next treadmill line', () => {
    const right = (x: number) => Math.max(...[0, 1, 2, 3].map((n) => lineSpot({ x, y: 3, kind: 'treadmill' }, n).x));
    const left = (x: number) => Math.min(...[0, 1, 2, 3].map((n) => lineSpot({ x, y: 3, kind: 'treadmill' }, n).x));
    // Name tags are up to about 50 pixels wide, so line centres need about that much room.
    expect(left(18) - right(15)).toBeGreaterThanOrEqual(50);
  });
});

describe('machine layout', () => {
  /** A machine's drawn box in art pixels: 64 wide, 48 tall above its floor point (mats are 32 tall). */
  const box = (m: (typeof MACHINE_LAYOUT)[number]) => {
    const s = machineSpot(m);
    const h = m.kind === 'yoga_mat' ? 32 : 48;
    return { left: s.x - 32, right: s.x + 32, top: s.y - h, bottom: s.y + 4 };
  };
  /** True when two boxes share any pixels. */
  const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  it('has room for every machine without any two overlapping', () => {
    for (const [i, a] of MACHINE_LAYOUT.entries()) {
      const ba = box(a);
      expect(ba.left).toBeGreaterThanOrEqual(0);
      expect(ba.right).toBeLessThanOrEqual(ROOM_PX.w);
      expect(ba.bottom).toBeLessThan(ROOM_PX.h);
      for (const b of MACHINE_LAYOUT.slice(i + 1)) expect(overlap(ba, box(b)), `${a.id} and ${b.id}`).toBe(false);
    }
  });

  it('keeps a full line, name tags included, clear of every other machine', () => {
    for (const m of MACHINE_LAYOUT) {
      for (let n = 0; n < 4; n++) {
        const p = lineSpot(m, n);
        // A standing agent's name tag sits about 7 to 12 pixels below their feet and is up to about 50 wide.
        const tag = { left: p.x - 25, right: p.x + 25, top: p.y + 2, bottom: p.y + 12 };
        for (const other of MACHINE_LAYOUT) if (other.id !== m.id) expect(overlap(tag, box(other)), `${m.id} line ${n} vs ${other.id}`).toBe(false);
      }
    }
  });
});
