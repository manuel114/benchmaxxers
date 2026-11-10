import { describe, expect, it } from 'vitest';
import { MACHINE_LAYOUT } from '@benchmaxxers/shared';
import { DOOR, areaSpot, lineSpot, machineSpot, type Point } from './layout.js';
import { findPath, isFree, standClear } from './paths.js';

/** Every point along a route, every 2 pixels, from `from` through each waypoint. */
const walk = (from: Point, route: Point[]): Point[] => {
  const pts: Point[] = [];
  let a = from;
  for (const b of route) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let i = 0; i <= steps; i++) pts.push({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps });
    a = b;
  }
  return pts;
};

describe('walking around furniture', () => {
  it('walks from the door to the lockers without crossing the desk or the lockers', () => {
    const to = standClear(areaSpot('locker_room', 0, 'agt_x'));
    const route = findPath(DOOR, to);
    expect(route.length).toBeGreaterThan(1);
    expect(walk(DOOR, route).every(isFree)).toBe(true);
  });

  it('puts check-in, locker and cooler spots on open floor in front of the furniture', () => {
    for (const area of ['front_desk', 'locker_room', 'water_cooler'] as const) {
      for (let n = 0; n < 8; n++) expect(isFree(areaSpot(area, n, `agt_${n}`)), `${area} ${n}`).toBe(true);
    }
  });

  it('reaches every machine seat from the door, only stepping off open floor at the very end', () => {
    for (const m of MACHINE_LAYOUT) {
      const seat = machineSpot(m);
      const route = findPath(DOOR, seat);
      expect(route.at(-1)).toEqual(seat);
      const before = walk(DOOR, route.slice(0, -1));
      expect(before.every(isFree), m.id).toBe(true);
    }
  });

  it('keeps every line spot on open floor', () => {
    for (const m of MACHINE_LAYOUT) for (let n = 0; n < 3; n++) expect(isFree(lineSpot(m, n)), `${m.id} ${n}`).toBe(true);
  });
});

describe('hanging out', () => {
  it('puts agents hanging out in the weights area on open floor, not on benches', async () => {
    const { placeAll } = await import('./layout.js');
    const { MACHINE_LAYOUT: layout, DEFAULT_APPEARANCE } = await import('@benchmaxxers/shared');
    const agents = Array.from({ length: 12 }, (_, i) => ({
      id: `agt_${i}`, name: `A${i}`, model: 'm', league: 'medium' as const, build: 1 as const, area: 'weights' as const,
      activity: 'idle' as const, machine: null, line: null, headphones: null, spotting: null, stats: { strength: 0, stamina: 0, flexibility: 0 }, appearance: DEFAULT_APPEARANCE,
    }));
    const gym = { id: 'gym-1', name: 'Gym 1', capacity: 24, agents, machines: layout.map((m) => ({ ...m, occupant: null, line: [], offeredTo: null, set: null, partner: null, spotter: null })), speakers: null, whiteboard: [] } as never;
    const places = placeAll(gym, isFree);
    for (const p of places.values()) expect(isFree(p)).toBe(true);
    const spots = new Set([...places.values()].map((p) => `${Math.round(p.x / 16)},${Math.round(p.y / 16)}`));
    expect(spots.size).toBe(12);
  });
});
