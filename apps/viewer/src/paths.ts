/**
 * Walking around things. The floor is a grid of 8-pixel cells; furniture,
 * machines and walls block cells. Agents find a route with A* and then
 * straighten it, so they walk around the desk and lockers instead of through
 * them. Mats are flat, so they stay walkable.
 */
import { ASSETS } from '@benchmaxxers/shared/assets';
import { MACHINE_LAYOUT, type MachineKind } from '@benchmaxxers/shared';
import { ROOM_PX, WALL_ROWS, machineSpot, type Point } from './layout.js';
import { FLOOR_PROPS } from './furniture.js';
import { ROOM } from '@benchmaxxers/shared';

/** Size of one floor cell in art pixels. */
export const CELL = 8;

/** A rectangle in art pixels. */
export type Box = { left: number; top: number; right: number; bottom: number };

/** How much room to leave around things: a body's half-width at the sides, a little above and below. */
const MARGIN = { side: 8, top: 2, bottom: 4 } as const;

/** Machines whose sprite stands up off the floor (mats lie flat and can be walked over). */
const SOLID_MACHINES: MachineKind[] = ['bench', 'treadmill'];

/** The box a sprite covers when drawn with its anchor at (x, y). */
const spriteBox = (id: string, x: number, y: number): Box => {
  const def = ASSETS.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown sprite ${id}`);
  const left = x - def.anchor[0];
  const top = y - def.anchor[1];
  return { left, top, right: left + def.width, bottom: top + def.height };
};

/** Everything agents should walk around, grown by the margin. */
export const obstacles = (): Box[] => {
  const boxes = [
    ...FLOOR_PROPS.map(([id, x, y]) => spriteBox(id, x, y)),
    ...MACHINE_LAYOUT.filter((m) => SOLID_MACHINES.includes(m.kind)).map((m) => {
      const s = machineSpot(m);
      return spriteBox('prop.bench_back', s.x, s.y); // benches and treadmills share a 64×48 footprint and anchor
    }),
  ];
  return boxes.map((b) => ({ left: b.left - MARGIN.side, top: b.top - MARGIN.top, right: b.right + MARGIN.side, bottom: b.bottom + MARGIN.bottom }));
};

/** Grid size in cells. */
const COLS = Math.ceil(ROOM_PX.w / CELL);
const ROWS = Math.ceil(ROOM_PX.h / CELL);

/** Which cells are blocked; built on first use. */
let blocked: Uint8Array | null = null;

/** The blocked-cell grid: walls plus every obstacle. */
const grid = (): Uint8Array => {
  if (blocked) return blocked;
  const g = new Uint8Array(COLS * ROWS);
  const wallTop = WALL_ROWS * ROOM.tile - 2;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
      if (cy < wallTop || cx < 10 || cx > ROOM_PX.w - 10 || cy > ROOM_PX.h - 8) g[r * COLS + c] = 1;
    }
  }
  for (const b of obstacles()) {
    for (let r = Math.max(0, Math.floor(b.top / CELL)); r < Math.min(ROWS, Math.ceil(b.bottom / CELL)); r++) {
      for (let c = Math.max(0, Math.floor(b.left / CELL)); c < Math.min(COLS, Math.ceil(b.right / CELL)); c++) g[r * COLS + c] = 1;
    }
  }
  blocked = g;
  return g;
};

/** The cell a point is in, clamped to the room. */
const cellOf = (p: Point): [number, number] => [
  Math.min(COLS - 1, Math.max(0, Math.floor(p.x / CELL))),
  Math.min(ROWS - 1, Math.max(0, Math.floor(p.y / CELL))),
];

/** True when the cell at (c, r) can be stood on. */
const free = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < COLS && r < ROWS && grid()[r * COLS + c] === 0;

/** True when a point is on walkable floor. */
export const isFree = (p: Point): boolean => free(...cellOf(p));

/** The nearest walkable cell centre to a point (the point itself if it's already walkable). */
export const standClear = (p: Point): Point => {
  const [c0, r0] = cellOf(p);
  if (free(c0, r0)) return p;
  for (let d = 1; d < Math.max(COLS, ROWS); d++) {
    let best: Point | null = null;
    let bestDist = Infinity;
    for (let dr = -d; dr <= d; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== d || !free(c0 + dc, r0 + dr)) continue;
        const q = { x: (c0 + dc) * CELL + CELL / 2, y: (r0 + dr) * CELL + CELL / 2 };
        const dist = Math.hypot(q.x - p.x, q.y - p.y);
        if (dist < bestDist) { bestDist = dist; best = q; }
      }
    }
    if (best) return best;
  }
  return p;
};

/** True when the straight line from a to b crosses only walkable floor. */
const clearLine = (a: Point, b: Point): boolean => {
  // Every 2 pixels, so a diagonal can't slip past the corner of a box between samples.
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isFree({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
};

/**
 * The points to walk through to get from `from` to `to`, ending at `to`.
 * Starts and ends may sit inside a blocked spot (a machine's seat): the route
 * steps out to the nearest open floor first and in from it last. Falls back
 * to a straight line if there is no route.
 */
export const findPath = (from: Point, to: Point): Point[] => {
  if (clearLine(from, to) && isFree(from) && isFree(to)) return [to];
  const start = standClear(from);
  const goal = standClear(to);
  const [sc, sr] = cellOf(start);
  const [gc, gr] = cellOf(goal);
  const key = (c: number, r: number) => r * COLS + c;
  const g = new Float64Array(COLS * ROWS).fill(Infinity);
  const came = new Int32Array(COLS * ROWS).fill(-1);
  const closed = new Uint8Array(COLS * ROWS);
  /** Straight-line-with-diagonals distance to the goal. */
  const h = (c: number, r: number) => { const dx = Math.abs(c - gc), dy = Math.abs(r - gr); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  const open: number[] = [key(sc, sr)];
  g[key(sc, sr)] = 0;
  let found = false;
  while (open.length) {
    // Small grid, few searches: a linear scan for the best open cell is fast enough.
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i]!, b = open[bi]!;
      if (g[a]! + h(a % COLS, Math.floor(a / COLS)) < g[b]! + h(b % COLS, Math.floor(b / COLS))) bi = i;
    }
    const cur = open.splice(bi, 1)[0]!;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const c = cur % COLS, r = Math.floor(cur / COLS);
    if (c === gc && r === gr) { found = true; break; }
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (!free(nc, nr)) continue;
        if (dc && dr && (!free(c + dc, r) || !free(c, r + dr))) continue; // no cutting corners
        const n = key(nc, nr);
        const cost = g[cur]! + (dc && dr ? Math.SQRT2 : 1);
        if (cost < g[n]!) { g[n] = cost; came[n] = cur; open.push(n); }
      }
    }
  }
  if (!found) return [to];

  // Cell centres from start to goal, then straightened: skip ahead to the farthest point in plain sight.
  const cells: Point[] = [];
  for (let k = key(gc, gr); k !== -1; k = came[k]!) cells.unshift({ x: (k % COLS) * CELL + CELL / 2, y: Math.floor(k / COLS) * CELL + CELL / 2 });
  const route: Point[] = [];
  if (!isFree(from) || start !== from) route.push(start);
  let at = start;
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !clearLine(at, cells[j]!)) j--;
    at = cells[j]!;
    route.push(at);
    i = j;
  }
  /** Adds a point unless the route already ends there. */
  const add = (p: Point) => { const last = route.at(-1); if (!last || last.x !== p.x || last.y !== p.y) route.push(p); };
  if (goal !== to) add(goal);
  add(to);
  return route;
};
