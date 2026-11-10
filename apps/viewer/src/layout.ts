/**
 * Where everything stands in the room, in art pixels (the room is
 * ROOM.cols × ROOM.tile wide). The server only says which area, machine or
 * line an agent is in; this turns that into a spot and a pose. Pure.
 */
import { AREA_RECTS, ROOM, type AgentView, type GymSnapshot, type MachineKind, type MachineView } from '@benchmaxxers/shared';
import { hashString } from './appearance.js';

/** A point in art pixels. */
export type Point = { x: number; y: number };

/** What the body is doing, which picks the animation. */
export type Pose = 'stand' | 'wait' | 'rest' | 'bench' | 'run' | 'yoga';

/** Where one agent should be and how it should look there. */
export type Placement = Point & { pose: Pose; facing: 'down' | 'up' | 'left' | 'right'; machineId: string | null };

/** Room size in art pixels. */
export const ROOM_PX = { w: ROOM.cols * ROOM.tile, h: ROOM.rows * ROOM.tile } as const;

/** Rows of back wall at the top of the room, in tiles. */
export const WALL_ROWS = 2;

/** Where people come in and go out: the door in the back wall above the front desk. */
export const DOOR: Point = { x: 3 * ROOM.tile, y: WALL_ROWS * ROOM.tile + 3 };

/** The pose for someone using each machine. */
const POSE_FOR: Record<MachineKind, Pose> = { bench: 'bench', treadmill: 'run', yoga_mat: 'yoga' };

/** The floor point a machine stands on (its sprite anchor). */
export const machineSpot = (m: Pick<MachineView, 'x' | 'y'>): Point => ({ x: m.x * ROOM.tile + ROOM.tile, y: m.y * ROOM.tile + 20 });

/** Where the person whose turn is next stands, beside the machine. */
const besideSpot = (m: MachineView): Point => {
  const s = machineSpot(m);
  return { x: s.x - 20, y: s.y };
};

/** Where the n-th person (0 = first) waiting in a machine's line stands. */
export const lineSpot = (m: MachineView, n: number): Point => {
  const s = machineSpot(m);
  return { x: s.x - 15 + n * 8, y: s.y + 14 };
};

/** A free standing spot inside an area, the n-th of the agents loitering there. */
export const areaSpot = (area: AgentView['area'], n: number, agentId: string): Point => {
  const r = AREA_RECTS[area];
  const left = r.x * ROOM.tile + 8;
  const top = Math.max(r.y, WALL_ROWS) * ROOM.tile + 22;
  const cols = Math.max(1, Math.floor((r.w * ROOM.tile - 12) / 13));
  const rows = Math.max(1, Math.floor((r.h * ROOM.tile - 20) / 15));
  const slot = n % (cols * rows);
  const jitter = hashString(agentId) % 4;
  return { x: left + (slot % cols) * 13 + jitter - 2, y: top + Math.floor(slot / cols) * 15 + (jitter % 2) };
};

/** Works out where every agent in the gym should be. */
export const placeAll = (gym: GymSnapshot): Map<string, Placement> => {
  const out = new Map<string, Placement>();
  const byId = new Map(gym.machines.map((m) => [m.id, m]));
  const loiter = new Map<string, number>();

  for (const a of [...gym.agents].sort((x, y) => x.id.localeCompare(y.id))) {
    const occupied = a.machine ? byId.get(a.machine) : undefined;
    if (occupied && occupied.occupant === a.id) {
      const spot = machineSpot(occupied);
      out.set(a.id, a.activity === 'lifting'
        ? { ...spot, pose: POSE_FOR[occupied.kind], facing: 'right', machineId: occupied.id }
        : { ...besideSpot(occupied), pose: 'stand', facing: 'right', machineId: null });
      continue;
    }
    const lineFor = a.line ? byId.get(a.line) : undefined;
    if (lineFor) {
      const n = lineFor.offeredTo === a.id ? -1 : lineFor.line.indexOf(a.id);
      const spot = n < 0 ? besideSpot(lineFor) : lineSpot(lineFor, n);
      out.set(a.id, { ...spot, pose: n < 0 ? 'stand' : 'wait', facing: n < 0 ? 'right' : 'up', machineId: null });
      continue;
    }
    const n = loiter.get(a.area) ?? 0;
    loiter.set(a.area, n + 1);
    out.set(a.id, { ...areaSpot(a.area, n, a.id), pose: a.area === 'water_cooler' || a.activity === 'resting' ? 'rest' : 'stand', facing: 'down', machineId: null });
  }
  return out;
};

/** Walking speed in art pixels per second. */
export const WALK_SPEED = 36;

/** One agent's on-screen position as it walks toward its placement. */
export type Mover = Point & { facing: Placement['facing']; walking: boolean };

/** Moves `m` toward `target` for `dt` seconds. Returns the new mover; it snaps when close. */
export const step = (m: Mover, target: Point, dt: number): Mover => {
  const dx = target.x - m.x;
  const dy = target.y - m.y;
  const dist = Math.hypot(dx, dy);
  const move = WALK_SPEED * dt;
  if (dist <= Math.max(move, 0.5)) return { x: target.x, y: target.y, facing: m.facing, walking: false };
  const facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  return { x: m.x + (dx / dist) * move, y: m.y + (dy / dist) * move, facing, walking: true };
};
