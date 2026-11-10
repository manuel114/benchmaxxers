/**
 * Stand-in art drawn in code, so the gym is watchable before the real images
 * exist. Every placeholder has the exact size, frame count and anchor from
 * the asset list and uses only palette colours, so the game code built
 * against it works unchanged when the real art lands in assets/.
 */
import type { AssetDef } from '@benchmaxxers/shared/assets';
import { CHAR, ENV, Pixels } from './pixels.js';

/** Three-tone ramps (dark, base, light) by palette names. */
const ramp = (pal: Record<string, string>, a: string, b: string, c: string): [string, string, string] => [pal[a]!, pal[b]!, pal[c]!];

/** Default swap ramps the character art is drawn in. */
const C = {
  ink: CHAR.ink!, cream: CHAR.cream!, blush: CHAR.blush!,
  skin: ramp(CHAR, 'skin-1', 'skin-2', 'skin-3'),
  hair: ramp(CHAR, 'hair-1', 'hair-2', 'hair-3'),
  top: ramp(CHAR, 'top-1', 'top-2', 'top-3'),
  bottoms: ramp(CHAR, 'bottoms-1', 'bottoms-2', 'bottoms-3'),
  shoes: ramp(CHAR, 'shoes-1', 'shoes-2', 'shoes-3'),
  headband: [CHAR['headband-1']!, CHAR['headband-2']!],
  wristband: [CHAR['wristband-1']!, CHAR['wristband-2']!],
  metal: ramp(CHAR, 'metal-1', 'metal-2', 'metal-3'),
  shine: CHAR['metal-4']!,
};

/** Body numbers per build: half the shoulder width, arm thickness, leg length. */
const BODY = [
  { half: 7, arm: 2, leg: 6, slouch: 1 },
  { half: 8, arm: 3, leg: 6, slouch: 0 },
  { half: 10, arm: 4, leg: 6, slouch: 0 },
  { half: 13, arm: 5, leg: 4, slouch: 0 },
] as const;

/** Which way a figure faces. Side means facing right. */
type Dir = 'down' | 'up' | 'side';

/** What a figure's arms are doing. */
type Arms = 'down' | 'watch' | 'sip' | 'stretch_l' | 'stretch_r' | 'fist' | 'up' | 'out';

/** One figure pose inside a 32 × 48 frame. */
type Pose = { dir: Dir; bob?: number; lift?: number; stride?: number; arms?: Arms; tank?: boolean };

/** Paints one 32 × 48 character frame with feet on row 46, centred on column 16. */
export const drawFigure = (build: 0 | 1 | 2 | 3, pose: Pose): Pixels => {
  const px = new Pixels(32, 48);
  const b = BODY[build];
  const lift = pose.lift ?? 0;
  const bob = (pose.bob ?? 0) + lift + b.slouch;
  const cx = 16;
  const side = pose.dir === 'side';
  const half = side ? Math.max(5, Math.round(b.half * 0.6)) : b.half;
  const feetY = 45 - lift;
  const legTop = feetY - 2 - b.leg;
  const stride = pose.stride ?? 0;

  // Legs and shoes.
  const legW = build === 3 ? 3 : 4;
  const legs = side ? [cx - 2] : [cx - 1 - legW, cx + 1];
  legs.forEach((lx, i) => {
    const up = i === 0 ? Math.max(0, stride) : Math.max(0, -stride);
    const shift = side ? (i === 0 ? stride : -stride) : 0;
    px.block(lx + shift, legTop, legW, b.leg - up, C.skin);
    px.block(lx + shift - (side ? 0 : 0), feetY - 1 - up, legW + (side ? 2 : 0), 2, C.shoes);
  });
  if (side && stride !== 0) {
    px.block(cx - 2 - stride, legTop, legW, b.leg, C.skin);
    px.block(cx - 2 - stride, feetY - 1, legW + 2, 2, C.shoes);
  }

  // Shorts.
  const hipHalf = Math.min(half, side ? 4 : build === 3 ? 6 : Math.max(5, half - 2));
  const shortsTop = legTop - 5 - bob;
  px.block(cx - hipHalf, shortsTop, hipHalf * 2, legTop - shortsTop + 1, C.bottoms);

  // Torso.
  const torsoTop = 22 - bob + 1;
  const torsoBottom = shortsTop;
  const torsoHalf = side ? half : half - (pose.tank ? 0 : 0);
  px.block(cx - torsoHalf, torsoTop, torsoHalf * 2, torsoBottom - torsoTop + 1, C.top);
  if (pose.tank && !side) {
    // Tank top: shoulders show skin.
    px.rect(cx - torsoHalf, torsoTop, 3, 2, C.skin[1]);
    px.rect(cx + torsoHalf - 3, torsoTop, 3, 2, C.skin[1]);
  }

  // Arms.
  const arm = (x: number, mode: Arms, isLeft: boolean) => {
    const w = b.arm;
    const top = torsoTop + 1;
    const len = torsoBottom - torsoTop + 1;
    if (mode === 'down' || (mode === 'watch' && !isLeft) || (mode === 'sip' && isLeft) || (mode === 'stretch_l' && !isLeft) || (mode === 'stretch_r' && isLeft) || (mode === 'fist' && isLeft) || (mode === 'out' && false)) {
      px.block(x, top, w, len - 1, C.skin);
      px.rect(x, top + len - 4, w, 2, C.wristband[0]!);
      px.rect(x, top + len - 4, w, 1, C.wristband[1]!);
      return;
    }
    if (mode === 'out') {
      const ox = isLeft ? x - 6 : x;
      px.block(ox, top + 1, w + 6, w, C.skin);
      px.rect(isLeft ? ox + 1 : ox + w + 3, top + 1, 2, w, C.wristband[0]!);
      return;
    }
    if (mode === 'watch' || mode === 'sip') {
      // Forearm raised across the chest.
      px.block(x, top, w, 5, C.skin);
      const fx = isLeft ? x : cx - 3;
      px.block(Math.min(x, fx), top + 4, Math.abs(fx - x) + w, w, C.skin);
      if (mode === 'watch') px.rect(fx, top + 4, 2, w, C.wristband[0]!);
      if (mode === 'sip') px.block(cx + 1, 16 - bob, 3, 7, C.metal);
      return;
    }
    // Arm above the head.
    px.block(x, top - 12, w, 13, C.skin);
    px.rect(x, top - 10, w, 2, C.wristband[0]!);
  };
  if (side) {
    arm(cx - 1, pose.arms === 'up' ? 'up' : pose.arms === 'out' ? 'out' : 'down', false);
  } else {
    const a = pose.arms ?? 'down';
    const both = a === 'up' ? 'up' : a === 'out' ? 'out' : a;
    arm(cx - torsoHalf - b.arm, both === 'fist' ? 'down' : both, true);
    arm(cx + torsoHalf, both === 'fist' ? 'up' : both, false);
  }

  // Head: 16 wide, 15 tall.
  const hx = cx - 8;
  const hy = 7 - bob;
  if (pose.dir === 'up') {
    px.block(hx, hy, 16, 15, C.hair);
    px.rect(hx, hy + 5, 16, 2, C.headband[1]!);
    px.rect(hx, hy + 6, 16, 1, C.headband[0]!);
  } else {
    px.block(hx, hy, 16, 15, C.skin);
    px.block(hx, hy, 16, 5, C.hair);
    px.rect(hx, hy + 5, 16, 1, C.headband[1]!);
    px.rect(hx, hy + 6, 16, 1, C.headband[0]!);
    if (side) {
      px.block(hx, hy, 6, 11, C.hair);
      px.rect(hx + 11, hy + 8, 2, 3, C.ink);
      px.set(hx + 11, hy + 8, C.cream);
      px.rect(hx + 12, hy + 12, 2, 1, C.blush);
    } else {
      px.rect(hx + 4, hy + 8, 2, 3, C.ink);
      px.rect(hx + 10, hy + 8, 2, 3, C.ink);
      px.set(hx + 4, hy + 8, C.cream);
      px.set(hx + 10, hy + 8, C.cream);
      px.rect(hx + 2, hy + 11, 2, 1, C.blush);
      px.rect(hx + 12, hy + 11, 2, 1, C.blush);
      px.rect(hx + 7, hy + 12, 2, 1, C.ink);
    }
  }

  px.outline(C.ink);
  // Keep the two rows under the feet empty, as the style guide asks.
  for (let y = 47; y < 48; y++) for (let x = 0; x < 32; x++) px.clear(x, y);
  return px;
};

/** A barbell seen from the side: bar with a plate on the near end. */
const drawBar = (px: Pixels, x: number, y: number, w: number): void => {
  px.rect(x, y, w, 2, C.metal[1]);
  px.rect(x, y, w, 1, C.shine);
  px.block(x + 2, y - 5, 4, 12, C.metal);
  px.block(x + w - 6, y - 5, 4, 12, C.metal);
};

/** Paints a 64 × 64 action frame. The contact point is (32, 60). */
const drawAction = (build: 0 | 1 | 2 | 3, kind: string, frame: number): Pixels => {
  const px = new Pixels(64, 64);
  const tank = build === 3;
  if (kind === 'bench_press' || kind === 'bench_fail') {
    // The standing figure turned to lie on its back, head on the left.
    const lying = drawFigure(build, { dir: 'down', arms: 'down', tank }).rotateLeft();
    // Lying figure is 48 wide × 32 tall; the bench top sits around row 38.
    px.paste(lying, 8, 22);
    const press = kind === 'bench_press' ? [0, 4, 8, 4][frame]! : [6, 3, 1, 0][frame]!;
    const barY = 26 - press;
    const armX = 26;
    px.block(armX, barY + 2, 4, 36 - barY - 2, C.skin);
    drawBar(px, armX - 9, barY, 22);
    if (kind === 'bench_fail' && frame >= 2) px.block(14, 18, 2, 3, C.metal);
    return px;
  }
  const stride = [2, 0, -2, 0][frame % 4]!;
  if (kind === 'run') {
    const fig = drawFigure(build, { dir: 'side', stride, bob: frame % 2, tank });
    px.paste(fig, 16, 14);
    return px;
  }
  if (kind === 'yoga_tree') {
    px.paste(drawFigure(build, { dir: 'down', arms: 'up', bob: frame, tank }), 16, 14);
    return px;
  }
  if (kind === 'yoga_warrior') {
    px.paste(drawFigure(build, { dir: 'side', stride: 3, arms: 'out', bob: frame, tank }), 16, 14);
    return px;
  }
  // Downward dog: hands and feet on the floor, hips up.
  const rot = drawFigure(build, { dir: 'side', arms: 'up', tank }).rotateLeft();
  px.paste(rot, 8 + frame, 28);
  return px;
};

/** Paints one frame of a character animation by its short name (`idle_down`, `walk_side`, `run`, …). */
const characterFrame = (build: 0 | 1 | 2 | 3, anim: string, frame: number): Pixels => {
  const tank = build === 3;
  const [verb, dirRaw] = anim.split('_') as [string, string | undefined];
  const dir: Dir = dirRaw === 'up' ? 'up' : dirRaw === 'side' ? 'side' : 'down';
  if (verb === 'idle') return drawFigure(build, { dir, bob: frame === 1 || frame === 2 ? 1 : 0, tank });
  if (verb === 'walk') return drawFigure(build, { dir, stride: [1, 0, -1, 0][frame]!, bob: frame % 2, tank });
  if (anim === 'wait_watch') return drawFigure(build, { dir: 'down', arms: frame === 0 ? 'down' : 'watch', tank });
  if (anim === 'wait_sip') return drawFigure(build, { dir: 'down', arms: frame === 0 || frame === 3 ? 'down' : 'sip', tank });
  if (anim === 'wait_stretch') return drawFigure(build, { dir: 'down', arms: frame < 2 ? 'stretch_l' : 'stretch_r', tank });
  if (anim === 'celebrate') return drawFigure(build, { dir: 'down', arms: frame % 2 === 0 ? 'down' : 'fist', lift: frame === 1 || frame === 2 ? 2 : 0, tank });
  return drawAction(build, anim, frame);
};

/** Environment ramps used by props and tiles. */
const E = {
  ink: ENV.ink!, shadow: ENV.shadow!, cream: ENV.cream!,
  wood: ramp(ENV, 'wood-1', 'wood-2', 'wood-3'),
  woodLight: ENV['wood-4']!,
  gray: ramp(ENV, 'gray-1', 'gray-2', 'gray-3'),
  wall: ramp(ENV, 'gray-3', 'gray-4', 'cream'),
  rubber: ramp(ENV, 'rubber-1', 'rubber-2', 'rubber-3'),
  green: ramp(ENV, 'green-1', 'green-2', 'green-3'),
  blue: ramp(ENV, 'blue-2', 'blue-3', 'blue-4'),
  red: ramp(ENV, 'red-1', 'red-2', 'red-3'),
  yellow: ramp(ENV, 'yellow-1', 'yellow-2', 'yellow-3'),
  pink: ramp(ENV, 'pink-1', 'pink-2', 'pink-3'),
  teal: ramp(ENV, 'teal-1', 'teal-2', 'teal-3'),
  purple: ramp(ENV, 'purple-1', 'purple-2', 'purple-3'),
  orange: ramp(ENV, 'orange-1', 'orange-2', 'orange-3'),
};

/** Paints a floor or wall tile. */
const drawTile = (id: string, w: number, h: number): Pixels => {
  const px = new Pixels(w, h);
  const variant = id.endsWith('_2') ? 1 : 0;
  if (id.startsWith('floor_rubber')) {
    px.rect(0, 0, w, h, E.rubber[1]);
    for (let i = 0; i < 7; i++) px.set((i * 11 + variant * 5) % w, (i * 7 + variant * 13) % h, E.rubber[2]);
    for (let i = 0; i < 4; i++) px.set((i * 13 + 3 + variant * 7) % w, (i * 9 + 5) % h, E.rubber[0]);
  } else if (id.startsWith('floor_wood')) {
    px.rect(0, 0, w, h, E.wood[2]);
    for (let y = 0; y < h; y += 8) {
      px.rect(0, y + 7, w, 1, E.wood[1]);
      const join = ((y / 8) * 13 + variant * 9) % w;
      px.rect(join, y, 1, 7, E.wood[1]);
      px.rect((join + 3) % w, y + 2, 4, 1, E.woodLight);
    }
  } else if (id.startsWith('floor_mat')) {
    const r = id.endsWith('pink') ? E.pink : E.teal;
    px.rect(0, 0, w, h, r[2]);
    px.rect(0, h - 1, w, 1, r[1]);
    px.rect(w - 1, 0, 1, h, r[1]);
  } else if (id === 'wall_back' || id === 'wall_window' || id === 'wall_door') {
    px.rect(0, 0, w, h, E.wall[1]);
    for (let y = 1; y < h - 12; y += 2) for (let x = (y >> 1) % 2; x < w; x += 8) px.set(x, y, E.wall[0]);
    px.block(0, h - 10, w, 10, E.wood);
    if (id === 'wall_window') {
      px.block(10, 8, w - 20, h - 26, [E.blue[0], E.blue[1], E.blue[2]]);
      px.rect(w / 2, 8, 1, h - 26, E.cream);
      px.rect(10, 8 + (h - 26) / 2, w - 20, 1, E.cream);
      px.rect(14, 12, 6, 1, E.cream);
    }
    if (id === 'wall_door') {
      px.block(14, 10, w - 28, h - 10, [E.gray[0], E.blue[2], E.cream]);
      px.rect(w / 2, 10, 1, h - 10, E.gray[0]);
    }
  } else if (id === 'wall_side') {
    px.block(0, 0, w, h, E.wall);
  } else {
    px.block(0, 0, w, h, E.wood);
  }
  return px;
};

/** Paints a still prop. Shapes only, no words, so it reads like the brief from its silhouette. */
const drawProp = (id: string, w: number, h: number): Pixels => {
  const px = new Pixels(w, h);
  const floor = h - 2;
  const shadow = (sw: number) => px.ellipse(Math.floor((w - sw) / 2), floor - 3, sw, 5, E.shadow);
  switch (id) {
    case 'front_desk':
      shadow(w - 4);
      px.block(4, 24, w - 8, floor - 24, E.wood);
      px.block(2, 20, w - 4, 6, [E.wood[1], E.wood[2], E.woodLight]);
      px.block(16, 6, 22, 15, E.gray);
      px.rect(18, 8, 18, 10, E.blue[1]);
      px.block(66, 14, 8, 6, E.yellow);
      break;
    case 'lockers':
      px.block(1, 2, 15, floor - 2, E.gray);
      px.block(16, 2, 15, floor - 2, E.gray);
      for (const x of [6, 21]) for (let y = 8; y < 16; y += 2) px.rect(x, y, 5, 1, E.gray[0]);
      px.rect(13, 30, 1, 4, E.gray[0]);
      px.block(26, 4, 4, floor - 6, [E.shadow, E.gray[0], E.gray[1]]);
      break;
    case 'locker_room_door':
      px.block(3, 4, w - 6, floor - 4, E.wood);
      px.block(10, 14, 12, 8, [E.blue[0], E.cream, E.cream]);
      px.rect(w - 9, 36, 2, 3, E.yellow[1]);
      break;
    case 'water_cooler':
      shadow(18);
      px.block(8, 20, 16, floor - 20, [E.gray[1], E.cream, E.cream]);
      px.block(10, 2, 12, 18, E.blue);
      px.rect(13, 4, 2, 10, E.cream);
      px.block(14, 26, 4, 3, E.red);
      px.block(24, 28, 5, 8, [E.gray[1], E.cream, E.cream]);
      break;
    case 'plant_big':
      shadow(20);
      px.block(9, 30, 14, floor - 30, E.orange);
      px.ellipse(3, 4, 26, 28, E.green[1]);
      px.ellipse(7, 6, 10, 12, E.green[2]);
      px.ellipse(16, 16, 10, 12, E.green[0]);
      break;
    case 'plant_small':
      shadow(14);
      px.block(10, 18, 12, floor - 18, E.teal);
      px.ellipse(6, 4, 20, 16, E.green[1]);
      px.ellipse(9, 6, 7, 7, E.green[2]);
      break;
    case 'speaker':
      px.block(6, 2, 20, 28, [E.ink, E.shadow, E.gray[0]]);
      px.ellipse(10, 6, 12, 10, E.gray[1]);
      px.ellipse(13, 9, 6, 4, E.shadow);
      px.ellipse(12, 18, 8, 8, E.gray[1]);
      break;
    case 'mirror':
      px.block(2, 2, w - 4, h - 4, [E.gray[1], E.gray[2], E.cream]);
      px.rect(5, 5, w - 10, h - 10, E.blue[2]);
      for (let i = 0; i < 12; i++) px.rect(14 + i, 30 - i * 2, 3, 2, E.cream);
      break;
    case 'poster_dumbbell':
    case 'poster_heart':
    case 'poster_bolt': {
      const col = id === 'poster_heart' ? E.red : id === 'poster_bolt' ? E.yellow : E.purple;
      px.block(4, 2, 24, 28, [E.gray[2], E.cream, E.cream]);
      if (id === 'poster_dumbbell') { px.rect(9, 15, 14, 2, col[1]); px.block(8, 11, 4, 10, col); px.block(20, 11, 4, 10, col); }
      if (id === 'poster_heart') { px.ellipse(9, 9, 8, 8, col[1]); px.ellipse(15, 9, 8, 8, col[1]); for (let i = 0; i < 7; i++) px.rect(10 + i, 15 + i, 12 - i * 2, 1, col[1]); }
      if (id === 'poster_bolt') { for (let i = 0; i < 8; i++) px.rect(17 - i, 7 + i, 4, 1, col[1]); px.rect(11, 15, 10, 2, col[1]); for (let i = 0; i < 7; i++) px.rect(15 - i + 2, 17 + i, 4, 1, col[1]); }
      break;
    }
    case 'clock':
      px.ellipse(4, 4, 24, 24, E.gray[0]);
      px.ellipse(6, 6, 20, 20, E.cream);
      px.rect(15, 9, 2, 8, E.ink);
      px.rect(15, 15, 6, 2, E.ink);
      break;
    case 'dumbbell_rack':
      shadow(w - 6);
      px.block(4, 14, w - 8, 4, E.gray);
      px.rect(6, 18, 3, floor - 18, E.gray[0]);
      px.rect(w - 9, 18, 3, floor - 18, E.gray[0]);
      [E.red, E.blue, E.yellow, E.green, E.purple].forEach((r, i) => {
        const x = 7 + i * 11;
        px.rect(x + 2, 9, 5, 2, E.gray[1]);
        px.block(x, 6, 3, 8, r);
        px.block(x + 6, 6, 3, 8, r);
      });
      break;
    case 'kettlebells':
      shadow(26);
      [[3, 14, 12], [15, 18, 9], [24, 21, 7]].forEach(([x, y, s]) => {
        px.ellipse(x!, y!, s!, s!, E.gray[0]);
        px.ellipse(x! + 2, y! - 4, s! - 4, 6, E.gray[1]);
        px.ellipse(x! + 4, y! - 2, s! - 8, 3, E.shadow);
      });
      break;
    case 'bench_back':
      shadow(52);
      px.block(6, 28, 44, 6, E.red);
      px.rect(10, 34, 3, floor - 34, E.gray[0]);
      px.rect(44, 34, 3, floor - 34, E.gray[0]);
      px.block(18, 6, 3, floor - 6, E.gray);
      px.block(34, 6, 3, floor - 6, E.gray);
      px.rect(16, 6, 7, 2, E.gray[2]);
      px.rect(32, 6, 7, 2, E.gray[2]);
      break;
    case 'bench_bar':
      px.rect(2, 11, w - 4, 2, E.gray[1]);
      px.rect(2, 11, w - 4, 1, E.gray[2]);
      px.block(6, 2, 5, 20, [E.ink, E.gray[0], E.gray[1]]);
      px.block(w - 11, 2, 5, 20, [E.ink, E.gray[0], E.gray[1]]);
      break;
    case 'treadmill_back':
      shadow(58);
      px.block(2, 34, 56, 8, [E.ink, E.shadow, E.gray[0]]);
      px.rect(4, 34, 52, 2, E.rubber[2]);
      px.ellipse(2, 34, 6, 8, E.gray[1]);
      px.block(52, 8, 4, 28, E.gray);
      break;
    case 'treadmill_front':
      px.block(44, 4, 18, 8, [E.gray[0], E.gray[1], E.gray[2]]);
      px.rect(47, 6, 10, 3, E.green[2]);
      px.block(24, 20, 30, 3, E.gray);
      px.block(52, 12, 3, 24, E.gray);
      break;
    case 'yoga_mat_pink':
    case 'yoga_mat_teal':
    case 'yoga_mat_purple':
    case 'yoga_mat_green': {
      const r = id.endsWith('pink') ? E.pink : id.endsWith('teal') ? E.teal : id.endsWith('purple') ? E.purple : E.green;
      px.block(4, 10, w - 14, 16, r);
      px.ellipse(w - 14, 8, 10, 20, r[1]);
      px.ellipse(w - 12, 12, 5, 10, r[0]);
      break;
    }
    default:
      shadow(w - 8);
      px.block(4, 4, w - 8, h - 8, E.gray);
  }
  px.outline(E.ink);
  return px;
};

/** Paints a small effect or UI piece. */
const drawFx = (id: string, w: number, h: number, frame: number): Pixels => {
  const px = new Pixels(w, h);
  switch (id) {
    case 'sweat':
      if (frame < 3) { px.ellipse(6, 4 + frame * 3, 4, 5, E.blue[1]); px.set(7, 5 + frame * 3, E.cream); }
      break;
    case 'sparkle': {
      const s = [1, 3, 2, 1][frame]!;
      px.rect(7, 7 - s, 2, s * 2 + 2, E.yellow[1]);
      px.rect(7 - s, 7, s * 2 + 2, 2, E.yellow[1]);
      px.rect(7, 7, 2, 2, E.cream);
      break;
    }
    case 'cheer':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = 3 + frame * 3;
        const col = i % 2 ? E.pink[1] : E.yellow[1];
        px.rect(Math.round(15 + Math.cos(a) * r), Math.round(15 + Math.sin(a) * r), 2, 2, col);
      }
      break;
    case 'dust':
      for (let i = 0; i < 4; i++) px.ellipse(2 + i * 7 - frame, 8 - frame, 6 + frame, 5, frame > 2 ? E.gray[1] : E.gray[2]);
      break;
    case 'notes':
      px.rect(3, 6 - frame, 2, 6, E.ink);
      px.rect(3, 6 - frame, 5, 2, E.ink);
      px.rect(1, 10 - frame, 3, 3, E.ink);
      px.rect(10, 9 - frame * 2, 2, 5, E.purple[1]);
      px.rect(8, 12 - frame * 2, 3, 3, E.purple[1]);
      break;
    case 'headphones_down':
    case 'headphones_up':
    case 'headphones_side': {
      px.rect(3, 0, w - 6, 2, CHAR['metal-1']!);
      px.block(0, 2, 4, 9, [CHAR.ink!, CHAR['metal-2']!, CHAR['metal-3']!]);
      if (id !== 'headphones_side') px.block(w - 4, 2, 4, 9, [CHAR.ink!, CHAR['metal-2']!, CHAR['metal-3']!]);
      break;
    }
    default:
      px.block(1, 1, w - 2, h - 2, E.yellow);
  }
  return px;
};

/** Paints a UI piece or icon. */
const drawUi = (id: string, w: number, h: number): Pixels => {
  const px = new Pixels(w, h);
  const icon: Record<string, [string, string, string]> = {
    icon_dumbbell: E.purple, icon_heart: E.red, icon_leaf: E.green, icon_flame: E.orange,
    icon_trophy: E.yellow, icon_clock: E.gray, icon_headphones: E.gray, icon_note: E.purple,
  };
  if (icon[id]) {
    px.ellipse(2, 2, w - 4, h - 4, icon[id]![1]);
    px.ellipse(4, 4, 4, 4, icon[id]![2]);
    px.outline(E.ink);
    return px;
  }
  const fill = id === 'bubble_shout' ? E.yellow[2] : id === 'progress_fill' ? E.green[1] : id === 'line_badge' ? E.yellow[1] : id === 'name_tag' ? E.ink : E.cream;
  px.rect(1, 1, w - 2, h - 2, fill);
  px.outline(E.ink);
  return px;
};

/** Paints one placeholder frame strip for an asset: all frames left to right, exact manifest size. */
export const drawPlaceholder = (def: Pick<AssetDef, 'id' | 'width' | 'height' | 'frames'>): Pixels => {
  const strip = new Pixels(def.width * def.frames, def.height);
  const [group, a, b] = def.id.split('.') as [string, string, string | undefined];
  for (let f = 0; f < def.frames; f++) {
    let frame: Pixels;
    if (group === 'char') frame = characterFrame(Number(a!.split('-')[1]) as 0 | 1 | 2 | 3, b!, f);
    else if (group === 'npc') frame = characterFrame(2, b === 'wave' ? 'celebrate' : 'idle_down', f);
    else if (group === 'tile') frame = drawTile(a!, def.width, def.height);
    else if (group === 'prop') frame = drawProp(a!, def.width, def.height);
    else if (group === 'fx') frame = drawFx(a!, def.width, def.height, f);
    else if (group === 'ui') frame = drawUi(a!, def.width, def.height);
    else { frame = new Pixels(def.width, def.height); frame.block(0, 0, def.width, def.height, E.yellow); }
    strip.paste(frame, f * def.width, 0);
  }
  return strip;
};
