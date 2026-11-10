/**
 * Where the furniture stands, in art pixels. Shared by the renderer (to draw
 * it) and the path-finder (to walk around it).
 */
import { ROOM } from '@benchmaxxers/shared';
import type { Point } from './layout.js';

/** Where Mark stands, behind the front desk. */
export const MARK_SPOT: Point = { x: 2 * ROOM.tile + 16, y: 3 * ROOM.tile + 30 };

/** Where the front desk stands. */
export const DESK_SPOT: Point = { x: 3 * ROOM.tile, y: 4 * ROOM.tile + 30 };

/** Props standing on the floor: [sprite id, anchor x, anchor y]. Drawn depth-sorted with people, and walked around. */
export const FLOOR_PROPS: [string, number, number][] = [
  ['prop.front_desk', DESK_SPOT.x, DESK_SPOT.y],
  ['prop.plant_big', 20, 104],
  // Weights: free weights beside the benches.
  ['prop.dumbbell_rack', 416, 250],
  ['prop.kettlebells', 416, 330],
  // Locker corner by the entrance, where agents head when they go home.
  ['prop.lockers', 48, 254],
  ['prop.lockers', 80, 254],
  ['prop.lockers', 112, 254],
  ['prop.locker_room_door', 144, 254],
  // Water cooler lounge, where agents rest between sets.
  ['prop.water_cooler', 48, 382],
  ['prop.plant_small', 140, 380],
  ['prop.plant_big', 870, 500],
];
