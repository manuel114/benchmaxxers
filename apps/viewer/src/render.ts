/**
 * Draws the gym. The room is painted at art resolution (768 × 448) and scaled
 * up by a whole number, so pixels stay square. Words (names, bubbles, line
 * numbers) are drawn afterwards at screen resolution in Pixelify Sans, since
 * the style guide keeps text out of the images.
 */
import { AREA_RECTS, ROOM, type AgentView, type AreaId, type GymSnapshot, type MachineView } from '@benchmaxxers/shared';
import { appearanceFor, type Appearance } from './appearance.js';
import { DOOR, ROOM_PX, WALL_ROWS, machineSpot, placeAll, step, type Mover, type Placement, type Point } from './layout.js';
import { drawSprite, frameAt, type Sprite, type SpriteBank } from './sprites.js';
import { STAFF_ID, type Bubble, type ViewState } from './state.js';
import { ENV } from './pixels.js';
import { drawNine } from './nine.js';
import { linePlaceLabel } from './labels.js';

/** The font every word on the canvas uses. */
const FONT = '"Pixelify Sans", ui-monospace, monospace';

/** Where Mark stands, behind the front desk. */
const MARK_SPOT: Point = { x: 2 * ROOM.tile + 16, y: 3 * ROOM.tile + 30 };

/** Where the front desk stands. */
const DESK_SPOT: Point = { x: 3 * ROOM.tile, y: 4 * ROOM.tile + 30 };

/** Floor tile ids for each area. Two ids alternate in a checker. */
const FLOOR: Record<AreaId, [string, string]> = {
  front_desk: ['tile.floor_wood_1', 'tile.floor_wood_2'],
  weights: ['tile.floor_rubber_1', 'tile.floor_rubber_2'],
  cardio: ['tile.floor_wood_1', 'tile.floor_wood_2'],
  mats: ['tile.floor_mat_pink', 'tile.floor_mat_teal'],
  water_cooler: ['tile.floor_wood_1', 'tile.floor_wood_2'],
  locker_room: ['tile.floor_rubber_1', 'tile.floor_rubber_2'],
};

/** Back-wall pieces, left to right: [tile id, x in art pixels]. Gaps are plain wall. */
const WALL_FEATURES: [string, number][] = [
  ['tile.wall_door', 64],
  ['tile.wall_window', 224],
  ['tile.wall_window', 480],
  ['tile.wall_window', 640],
  ['tile.wall_window', 800],
];

/** Things hung on the back wall: [sprite id, anchor x, anchor y]. */
const WALL_PROPS: [string, number, number][] = [
  ['prop.speaker', 32, 34],
  ['prop.poster_bolt', 168, 44],
  ['prop.mirror', 352, 50],
  ['prop.poster_dumbbell', 432, 44],
  ['prop.clock', 592, 34],
  ['prop.poster_heart', 752, 44],
];

/** Props standing on the floor: [sprite id, anchor x, anchor y]. Drawn depth-sorted with people. */
const FLOOR_PROPS: [string, number, number][] = [
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

/** Mat colours, one per yoga mat in order. */
const MAT_COLOURS = ['pink', 'teal', 'purple', 'green'];

/** The area a tile belongs to, or null for open floor. */
const areaAt = (col: number, row: number): AreaId | null => {
  for (const [id, r] of Object.entries(AREA_RECTS) as [AreaId, (typeof AREA_RECTS)[AreaId]][]) {
    if (col >= r.x && col < r.x + r.w && row >= r.y && row < r.y + r.h) return id;
  }
  return null;
};

/** One thing to draw in the depth-sorted pass. */
type Drawable = { y: number; draw: () => void };

/** One agent the renderer is tracking, including ones walking out after they left. */
type Tracked = { mover: Mover; look: Appearance; leaving: boolean; agent: AgentView; since: number };

/** Paints the room and everyone in it onto a canvas, frame by frame. */
export class GymRenderer {
  private readonly art: HTMLCanvasElement;
  private readonly actx: CanvasRenderingContext2D;
  private room: HTMLCanvasElement | null = null;
  private readonly tracked = new Map<string, Tracked>();
  private last = 0;
  /** Current zoom, screen pixels per art pixel. */
  zoom = 2;
  /** The agent the viewer clicked, if any. */
  selected: string | null = null;
  /** Latest on-screen spots, for click hit-testing. */
  private spots = new Map<string, Point>();

  constructor(private readonly canvas: HTMLCanvasElement, private readonly sprites: SpriteBank) {
    this.art = document.createElement('canvas');
    this.art.width = ROOM_PX.w;
    this.art.height = ROOM_PX.h;
    this.actx = this.art.getContext('2d')!;
  }

  /**
   * Sizes the canvas to fill the space. The room is drawn at a whole-number
   * zoom of at least 2 (the smallest one at or above the space), then CSS
   * shrinks it to fit with nearest-neighbour scaling, so pixels stay sharp.
   */
  fit(maxWidth: number, maxHeight: number): void {
    const dpr = window.devicePixelRatio || 1;
    const cssScale = Math.min(maxWidth / ROOM_PX.w, maxHeight / ROOM_PX.h);
    const zoom = Math.max(2, Math.ceil(cssScale * dpr));
    this.zoom = zoom;
    this.canvas.width = ROOM_PX.w * zoom;
    this.canvas.height = ROOM_PX.h * zoom;
    this.canvas.style.width = `${Math.floor(ROOM_PX.w * cssScale)}px`;
    this.canvas.style.height = `${Math.floor(ROOM_PX.h * cssScale)}px`;
  }

  /** The agent under a click at CSS pixel (x, y) on the canvas, if any. */
  hit(cssX: number, cssY: number): string | null {
    const cssPerArt = this.canvas.getBoundingClientRect().width / ROOM_PX.w;
    const ax = cssX / cssPerArt;
    const ay = cssY / cssPerArt;
    let best: string | null = null;
    let bestD = 18;
    for (const [id, p] of this.spots) {
      const d = Math.hypot(p.x - ax, p.y - 20 - ay);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  /** Paints the floor, walls and wall props once; they never change. */
  private paintRoom(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = ROOM_PX.w;
    c.height = ROOM_PX.h;
    const ctx = c.getContext('2d')!;
    const t = ROOM.tile;
    for (let row = WALL_ROWS; row < ROOM.rows; row++) {
      for (let col = 0; col < ROOM.cols; col++) {
        const pair = FLOOR[areaAt(col, row) ?? 'cardio'];
        const s = this.sprites.get(pair[(col + row) % 2]!);
        ctx.drawImage(s.image, 0, 0, s.width, s.height, col * t, row * t, t, t);
      }
    }
    const back = this.sprites.get('tile.wall_back');
    for (let x = 0; x < ROOM_PX.w; x += back.width) ctx.drawImage(back.image, x, 0);
    for (const [id, x] of WALL_FEATURES) ctx.drawImage(this.sprites.get(id).image, x, 0);
    const side = this.sprites.get('tile.wall_side');
    for (let y = WALL_ROWS * t; y < ROOM_PX.h; y += side.height) {
      ctx.drawImage(side.image, 0, y);
      ctx.drawImage(side.image, ROOM_PX.w - side.width, y);
    }
    const front = this.sprites.get('tile.wall_front');
    for (let x = 0; x < ROOM_PX.w; x += front.width) ctx.drawImage(front.image, x, ROOM_PX.h - front.height);
    for (const [id, x, y] of WALL_PROPS) drawSprite(ctx, this.sprites.get(id), 0, x, y);
    return c;
  }

  /** Keeps the tracked movers in step with the latest state: new agents walk in at the door, leavers walk out. */
  private sync(gym: GymSnapshot, now: number): void {
    const present = new Set(gym.agents.map((a) => a.id));
    for (const a of gym.agents) {
      const t = this.tracked.get(a.id);
      if (t) { t.agent = a; t.leaving = false; if (t.look.source !== a.appearance) t.look = appearanceFor(a); continue; }
      this.tracked.set(a.id, { mover: { ...DOOR, facing: 'down', walking: true }, look: appearanceFor(a), leaving: false, agent: a, since: now });
    }
    for (const [id, t] of this.tracked) if (!present.has(id)) t.leaving = true;
  }

  /** Draws one full frame. */
  draw(state: ViewState, now: number): void {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    const ctx = this.actx;
    ctx.imageSmoothingEnabled = false;
    this.room ??= this.paintRoom();
    ctx.drawImage(this.room, 0, 0);

    const gym = state.gym;
    if (gym) this.sync(gym, now);
    const places = gym ? placeAll(gym) : new Map<string, Placement>();
    const flashFor = new Map(state.flashes.map((f) => [f.agentId, f]));
    const items: Drawable[] = [];
    const usedMachines = new Set<string>();

    // Move everyone a little toward where they should be.
    this.spots.clear();
    for (const [id, t] of this.tracked) {
      const place = t.leaving ? { ...DOOR, pose: 'stand' as const, facing: 'up' as const, machineId: null } : places.get(id);
      if (!place) continue;
      t.mover = step(t.mover, place, dt);
      if (t.leaving && !t.mover.walking) { this.tracked.delete(id); continue; }
      this.spots.set(id, t.mover);
      const arrived = !t.mover.walking;
      if (arrived && place.machineId) usedMachines.add(place.machineId);
      items.push({ y: t.mover.y + (arrived && place.machineId ? 1 : 0), draw: () => this.drawAgent(t, place, arrived, flashFor.get(id)?.kind ?? null, now) });
    }

    // Machines, with whoever is on them drawn in between their layers.
    if (gym) {
      gym.machines.forEach((m) => items.push(...this.machineItems(m, usedMachines.has(m.id), gym)));
    }
    for (const [id, x, y] of FLOOR_PROPS) items.push({ y, draw: () => drawSprite(ctx, this.sprites.get(id), 0, x, y) });
    items.push({ y: MARK_SPOT.y, draw: () => this.drawMark(now) });

    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    // Scale up, then words on top.
    const out = this.canvas.getContext('2d')!;
    out.imageSmoothingEnabled = false;
    out.drawImage(this.art, 0, 0, this.canvas.width, this.canvas.height);
    if (gym) this.drawOverlay(out, gym, state, now);
  }

  /** The back layer, front layer and resting bar for one machine. */
  private machineItems(m: MachineView, inUse: boolean, gym: GymSnapshot): Drawable[] {
    const ctx = this.actx;
    const s = machineSpot(m);
    const get = (id: string) => this.sprites.get(id);
    if (m.kind === 'bench') {
      return [
        { y: s.y - 0.5, draw: () => drawSprite(ctx, get('prop.bench_back'), 0, s.x, s.y) },
        ...(inUse ? [] : [{ y: s.y + 0.5, draw: () => drawSprite(ctx, get('prop.bench_bar'), 0, s.x, s.y - 28) }]),
      ];
    }
    if (m.kind === 'treadmill') {
      return [
        { y: s.y - 0.5, draw: () => drawSprite(ctx, get('prop.treadmill_back'), 0, s.x, s.y) },
        { y: s.y + 1.5, draw: () => drawSprite(ctx, get('prop.treadmill_front'), 0, s.x, s.y) },
      ];
    }
    const i = gym.machines.filter((x) => x.kind === 'yoga_mat').indexOf(m);
    const mat = get(`prop.yoga_mat_${MAT_COLOURS[i % MAT_COLOURS.length]}`);
    return [{ y: s.y - 40, draw: () => drawSprite(ctx, mat, 0, s.x, s.y + 2) }];
  }

  /** Picks the animation for an agent. */
  private animFor(t: Tracked, place: Placement, arrived: boolean, flash: string | null): { id: string; flip: boolean; action: boolean } {
    const b = `char.build-${t.agent.build}`;
    const facing = arrived ? place.facing : t.mover.facing;
    const dir = facing === 'left' || facing === 'right' ? 'side' : facing;
    const flip = facing === 'left';
    if (!arrived) return { id: `${b}.walk_${dir}`, flip, action: false };
    if (place.pose === 'bench') return { id: `${b}.${flash === 'dropped' ? 'bench_fail' : 'bench_press'}`, flip: false, action: true };
    if (place.pose === 'run') return { id: `${b}.run`, flip: false, action: true };
    if (place.pose === 'yoga') {
      const poses = ['yoga_tree', 'yoga_warrior', 'yoga_dog'];
      return { id: `${b}.${poses[Math.floor(t.since / 1000) % poses.length]}`, flip: false, action: true };
    }
    if (flash === 'personal_best' || flash === 'perfect') return { id: `${b}.celebrate`, flip: false, action: false };
    if (place.pose === 'rest') return { id: `${b}.wait_sip`, flip: false, action: false };
    if (place.pose === 'wait') {
      const waits = t.agent.stats.flexibility >= 40 ? ['wait_stretch', 'wait_watch'] : ['wait_watch', 'wait_sip'];
      return { id: `${b}.${waits[t.look.key.length % waits.length]}`, flip: false, action: false };
    }
    return { id: `${b}.idle_${dir}`, flip, action: false };
  }

  /** Draws one agent with its shadow, headphones and effects. */
  private drawAgent(t: Tracked, place: Placement, arrived: boolean, flash: string | null, now: number): void {
    const ctx = this.actx;
    const { x, y } = t.mover;
    const anim = this.animFor(t, place, arrived, flash);
    const sprite = this.sprites.forAgent(anim.id, t.look);
    const offset = t.look.key.charCodeAt(1) * 37;
    if (!anim.action) {
      ctx.fillStyle = ENV.shadow!;
      ctx.beginPath();
      ctx.ellipse(Math.round(x), Math.round(y), 7, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawSprite(ctx, sprite, frameAt(sprite, now, offset), x, y, anim.flip);

    const fx = (id: string, fxX: number, fxY: number) => {
      const s = this.sprites.get(id);
      drawSprite(ctx, s, frameAt(s, now, offset), fxX, fxY);
    };
    const headY = anim.action ? y - 46 : y - 40;
    if (t.agent.headphones) {
      if (!anim.action) {
        const dir = anim.id.includes('_up') ? 'up' : anim.id.includes('_side') ? 'side' : 'down';
        const hp: Sprite = this.sprites.forAgent(`fx.headphones_${dir}`, t.look);
        drawSprite(ctx, hp, 0, x, y - 26, anim.flip);
      }
      fx('fx.notes', x + 12, headY - 2);
    }
    if (place.pose !== 'stand' && arrived && anim.action && t.agent.activity === 'lifting' && Math.floor(now / 1800) % 2 === 0) fx('fx.sweat', x + 10, headY);
    if (flash === 'personal_best') fx('fx.sparkle', x, headY - 8);
    if (flash === 'perfect') fx('fx.cheer', x, headY + 4);
    if (flash === 'dropped') fx('fx.dust', x, y);
  }

  /** Draws Mark at the front desk. */
  private drawMark(now: number): void {
    const s = this.sprites.get('npc.mark.idle');
    drawSprite(this.actx, s, frameAt(s, now), MARK_SPOT.x, MARK_SPOT.y);
  }

  /** Names, line numbers, set progress and speech bubbles, at screen resolution. */
  private drawOverlay(ctx: CanvasRenderingContext2D, gym: GymSnapshot, state: ViewState, now: number): void {
    const z = this.zoom;
    const size = Math.max(10, Math.round(5.5 * z));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const ink = ENV.ink!;
    const cream = ENV.cream!;

    // Set progress bars over machines in use.
    for (const m of gym.machines) {
      if (!m.set) continue;
      const s = machineSpot(m);
      const done = m.set.answered / Math.max(1, m.set.total);
      const frame = this.sprites.get('ui.progress_frame');
      const fill = this.sprites.get('ui.progress_fill');
      let by = (s.y - 58) * z;
      if (frame.real && fill.real) {
        // Art bar: 44×8 frame; the empty inside is 2 pixels in from each side.
        const fw = 44;
        const fh = 8;
        const bx = Math.round((s.x - fw / 2) * z);
        by = Math.round((s.y - 60) * z);
        ctx.fillStyle = ENV['gray-1']!;
        ctx.fillRect(bx + 2 * z, by + 2 * z, (fw - 4) * z, (fh - 4) * z);
        const fillW = Math.round((fw - 4) * done);
        if (fillW > 0) ctx.drawImage(fill.image, 0, 0, fill.width, fill.height, bx + 2 * z, by + 2 * z, fillW * z, (fh - 4) * z);
        drawNine(ctx, frame, bx, by, fw, fh, z);
      } else {
        const w = 40 * z;
        const h = 4 * z;
        const bx = s.x * z - w / 2;
        ctx.fillStyle = ink;
        ctx.fillRect(bx - z, by - z, w + 2 * z, h + 2 * z);
        ctx.fillStyle = ENV['gray-1']!;
        ctx.fillRect(bx, by, w, h);
        ctx.fillStyle = ENV['green-2']!;
        ctx.fillRect(bx, by, Math.round(w * done), h);
      }
      ctx.font = `${Math.round(size * 0.85)}px ${FONT}`;
      ctx.fillStyle = cream;
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(2, z);
      const left = Math.max(0, Math.ceil((m.set.endsAt - Date.now()) / 1000));
      const label = `${m.set.weight} · ${m.set.answered}/${m.set.total} · ${left}s`;
      ctx.strokeText(label, s.x * z, by - size * 0.7);
      ctx.fillText(label, s.x * z, by - size * 0.7);
    }

    // Name tags and line numbers.
    const byId = new Map(gym.machines.map((m) => [m.id, m]));
    ctx.font = `${size}px ${FONT}`;
    for (const [id, p] of this.spots) {
      const t = this.tracked.get(id);
      if (!t) continue;
      const label = t.agent.name;
      const tx = p.x * z;
      const ty = (p.y + 7) * z;
      const tag = this.sprites.get('ui.name_tag');
      if (tag.real && id !== this.selected) {
        // Art tag: ink pill with a cream rim, sized to the name in whole art pixels.
        const w = Math.ceil(ctx.measureText(label).width / z) + 8;
        const h = Math.max(9, Math.ceil(size / z) + 4);
        drawNine(ctx, tag, Math.round(tx - (w * z) / 2), Math.round(ty - (h * z) / 2), w, h, z);
      } else {
        // The selected agent's tag stays a yellow pill so it stands out.
        const tw = ctx.measureText(label).width + 6 * z;
        ctx.fillStyle = id === this.selected ? ENV['yellow-2']! : ink;
        roundRect(ctx, tx - tw / 2, ty - size * 0.6, tw, size * 1.2, 2 * z);
        ctx.fill();
      }
      ctx.fillStyle = id === this.selected ? ink : cream;
      ctx.fillText(label, tx, ty + 0.5);

      const line = t.agent.line ? byId.get(t.agent.line) : undefined;
      const place = line ? line.line.indexOf(id) : -1;
      if (line && place >= 0 && !t.leaving) {
        // 1 means next up; the person offered the machine counts as ahead.
        const n = place + 1 + (line.offeredTo ? 1 : 0);
        // A yellow pill that says "next", "2nd", "3rd": a bare number in a circle read like a medal.
        const cy = (p.y - 52) * z;
        const label = linePlaceLabel(n);
        ctx.font = `${Math.round(size * 0.9)}px ${FONT}`;
        const w = Math.ceil(ctx.measureText(label).width / z) + 6;
        const h = 9;
        drawPill(ctx, Math.round(tx - (w * z) / 2), Math.round(cy - (h * z) / 2), w, h, z, ENV['yellow-2']!, ink);
        ctx.fillStyle = ink;
        ctx.fillText(label, tx, cy + 0.5);
        ctx.font = `${size}px ${FONT}`;
      }
    }

    // Speech bubbles last, so they sit on top of everything.
    for (const b of state.bubbles) {
      const p = b.agentId === STAFF_ID ? MARK_SPOT : this.spots.get(b.agentId);
      if (!p) continue;
      const onMachine = this.tracked.get(b.agentId)?.agent.activity === 'lifting';
      drawBubble(ctx, b, p.x * z, (p.y - (onMachine ? 62 : 52)) * z, z, size, Date.now(), this.sprites);
    }
  }
}

/** Draws a pixel-style pill: a 1-pixel ink outline with cut corners around a flat fill, `w`×`h` art pixels at zoom `z`. */
const drawPill = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, z: number, fill: string, ink: string): void => {
  ctx.fillStyle = ink;
  ctx.fillRect(x + z, y, (w - 2) * z, h * z);
  ctx.fillRect(x, y + z, w * z, (h - 2) * z);
  ctx.fillStyle = fill;
  ctx.fillRect(x + z, y + z, (w - 2) * z, (h - 2) * z);
};

/** Traces a rounded rectangle path. */
const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  ctx.beginPath();
  ctx.roundRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), r);
};

/** Splits text into lines that fit `max` pixels wide. */
const wrap = (ctx: CanvasRenderingContext2D, text: string, max: number): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4).map((l, i, all) => (i === 3 && all.length === 4 && lines.length > 4 ? `${l}…` : l));
};

/** The bubble art for each way of talking. */
const BUBBLE_ART: Record<Bubble['kind'], string> = { say: 'ui.bubble', staff: 'ui.bubble', whisper: 'ui.bubble_whisper', shout: 'ui.bubble_shout' };

/** Draws one speech bubble with its tail pointing down at (x, y). */
const drawBubble = (ctx: CanvasRenderingContext2D, b: Bubble, x: number, y: number, z: number, size: number, now: number, sprites: SpriteBank): void => {
  const ink = ENV.ink!;
  const text = b.text ?? '· · ·';
  ctx.font = `${size}px ${FONT}`;
  const lines = wrap(ctx, text, 110 * z);
  const lh = size * 1.15;
  const fade = Math.min(1, (b.until - now) / 400);
  const art = sprites.get(BUBBLE_ART[b.kind]);
  const tail = sprites.get('ui.bubble_tail');
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);

  if (art.real && tail.real) {
    // Art bubble in whole art pixels, so its outline stays crisp.
    const pad = b.kind === 'shout' ? 8 : 5;
    const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) / z) + 2 * pad;
    const h = Math.ceil((lines.length * lh) / z) + 2 * (pad - 1);
    const bx = Math.round(Math.min(Math.max(x - (w * z) / 2, 2 * z), ROOM_PX.w * z - w * z - 2 * z));
    const by = Math.round(Math.max(2 * z, y - h * z));
    drawNine(ctx, art, bx, by, w, h, z);
    // The tail's cream top row covers the bubble's bottom outline, joining the two. Shouts have spikes instead.
    if (b.kind !== 'shout') {
      const tx = Math.round(Math.min(Math.max(x, bx + 8 * z), bx + (w - 8) * z) - (tail.width * z) / 2);
      ctx.drawImage(tail.image, 0, 0, tail.width, tail.height, tx, by + (h - 2) * z, tail.width * z, tail.height * z);
    }
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    const top = by + ((h * z) - lines.length * lh) / 2;
    lines.forEach((l, i) => ctx.fillText(l, bx + (w * z) / 2, top + lh * (i + 0.5)));
    ctx.restore();
    return;
  }

  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 10 * z;
  const h = lines.length * lh + 6 * z;
  const bx = Math.min(Math.max(x - w / 2, 2 * z), ROOM_PX.w * z - w - 2 * z);
  const by = Math.max(2 * z, y - h);
  ctx.fillStyle = b.kind === 'shout' ? ENV['yellow-3']! : ENV.cream!;
  ctx.strokeStyle = ink;
  ctx.lineWidth = z;
  if (b.kind === 'whisper') ctx.setLineDash([2 * z, 2 * z]);
  roundRect(ctx, bx, by, w, h, 4 * z);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x - 3 * z, by + h - z / 2);
  ctx.lineTo(x, by + h + 4 * z);
  ctx.lineTo(x + 3 * z, by + h - z / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, by + 3 * z + lh * (i + 0.5)));
  ctx.restore();
};

