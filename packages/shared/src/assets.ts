/**
 * The single list of every image the game uses. `art/ASSETS.md` and
 * `assets/manifest.json` are generated from it (`pnpm assets:status`), and the
 * web viewer reads the manifest to know frame sizes, frame counts and speeds.
 */

/** Which palette an asset must be drawn in. */
export type PaletteName = 'environment' | 'character';

/** How the cleanup tool should treat the raw image. */
export type AssetKind = 'strip' | 'sprite' | 'tile';

/** One image file in `assets/`. */
export type AssetDef = {
  /** Stable id the game code uses, e.g. `char.build-1.walk_down`. */
  id: string;
  /** Path inside `assets/`. */
  file: string;
  kind: AssetKind;
  palette: PaletteName;
  /** Size of one frame in art pixels. */
  width: number;
  height: number;
  /** Frames laid out left to right in one row. 1 for still images. */
  frames: number;
  /** Frames per second for animations. */
  fps?: number;
  /** Point that sits on the object's spot in the room, from the frame's top left. */
  anchor: [number, number];
  /** Codex batch that produces it (see art/CODEX.md). */
  batch: number;
  /** `v1` ships in the first version; `later` can wait. */
  phase: 'v1' | 'later';
  /** What to draw, in plain words. */
  brief: string;
};

/** The four body builds, picked by the agent's strength. */
export const BUILDS = [
  { id: 0, name: 'Noodle', brief: 'thin arms, slight slouch, loose t-shirt' },
  { id: 1, name: 'Toned', brief: 'normal arms, stands straight, fitted t-shirt' },
  { id: 2, name: 'Buff', brief: 'big arms, broad chest, tight t-shirt' },
  { id: 3, name: 'Maxxed', brief: 'huge arms, very broad chest, tank top, comically tiny legs' },
] as const;

/** Character feet anchor inside a 32 x 48 frame. */
const CHAR_ANCHOR: [number, number] = [16, 46];
/** Contact-point anchor inside a 64 x 64 action frame. */
const ACTION_ANCHOR: [number, number] = [32, 60];

/** Builds the per-build character animations from one template. */
const characterAssets = (): AssetDef[] => {
  const out: AssetDef[] = [];
  for (const build of BUILDS) {
    const b = `build-${build.id}`;
    /** Batch: build 1 first (it becomes the reference), the others after. */
    const moveBatch = build.id === 1 ? 2 : 3;
    const actionBatch = 6;
    const base = { kind: 'strip' as const, palette: 'character' as const, phase: 'v1' as const };
    for (const dir of ['down', 'up', 'side'] as const) {
      out.push({ ...base, id: `char.${b}.idle_${dir}`, file: `characters/${b}/idle_${dir}.png`, width: 32, height: 48, frames: 4, fps: 6, anchor: CHAR_ANCHOR, batch: moveBatch, brief: `${build.name} build (${build.brief}), standing idle facing ${dir === 'side' ? 'right' : dir}, breathing` });
      out.push({ ...base, id: `char.${b}.walk_${dir}`, file: `characters/${b}/walk_${dir}.png`, width: 32, height: 48, frames: 4, fps: 10, anchor: CHAR_ANCHOR, batch: moveBatch, brief: `${build.name} build, walk cycle facing ${dir === 'side' ? 'right' : dir}` });
    }
    out.push({ ...base, id: `char.${b}.wait_watch`, file: `characters/${b}/wait_watch.png`, width: 32, height: 48, frames: 4, fps: 6, anchor: CHAR_ANCHOR, batch: 7, brief: `${build.name} build, facing down, lifts wrist and checks a watch` });
    out.push({ ...base, id: `char.${b}.wait_sip`, file: `characters/${b}/wait_sip.png`, width: 32, height: 48, frames: 4, fps: 6, anchor: CHAR_ANCHOR, batch: 7, brief: `${build.name} build, facing down, sips from a metal water bottle` });
    out.push({ ...base, id: `char.${b}.wait_stretch`, file: `characters/${b}/wait_stretch.png`, width: 32, height: 48, frames: 4, fps: 4, anchor: CHAR_ANCHOR, batch: 7, brief: `${build.name} build, facing down, stretches one arm overhead then the other` });
    out.push({ ...base, id: `char.${b}.celebrate`, file: `characters/${b}/celebrate.png`, width: 32, height: 48, frames: 4, fps: 10, anchor: CHAR_ANCHOR, batch: 7, brief: `${build.name} build, facing down, fist pump with a small jump` });
    // Batch 10: real-gym moments (spotting, greeting a regular, catching your breath).
    out.push({ ...base, id: `char.${b}.spot`, file: `characters/${b}/spot.png`, width: 32, height: 48, frames: 2, fps: 3, anchor: CHAR_ANCHOR, batch: 10, brief: `${build.name} build spotting: side view facing right, standing at the head of a bench and leaning forward, both hands held low and open ready to catch a barbell. No bench or bar drawn` });
    out.push({ ...base, id: `char.${b}.wave`, file: `characters/${b}/wave.png`, width: 32, height: 48, frames: 4, fps: 8, anchor: CHAR_ANCHOR, batch: 10, brief: `${build.name} build, facing down, waving hello with one raised hand` });
    out.push({ ...base, id: `char.${b}.breathe`, file: `characters/${b}/breathe.png`, width: 32, height: 48, frames: 4, fps: 4, anchor: CHAR_ANCHOR, batch: 10, brief: `${build.name} build, facing down, catching their breath after a set: bent forward with hands on knees, shoulders rising and falling` });
    out.push({ ...base, id: `char.${b}.bench_press`, file: `characters/${b}/bench_press.png`, width: 64, height: 64, frames: 4, fps: 8, anchor: ACTION_ANCHOR, batch: actionBatch, brief: `${build.name} build lying on their back, head to the left, pushing a barbell up and lowering it. No bench drawn` });
    out.push({ ...base, id: `char.${b}.bench_fail`, file: `characters/${b}/bench_fail.png`, width: 64, height: 64, frames: 4, fps: 8, anchor: ACTION_ANCHOR, batch: actionBatch, brief: `${build.name} build lying on their back, the barbell sinks onto the chest, arms flail, one sweat drop. No bench drawn` });
    out.push({ ...base, id: `char.${b}.run`, file: `characters/${b}/run.png`, width: 64, height: 64, frames: 4, fps: 12, anchor: ACTION_ANCHOR, batch: actionBatch, brief: `${build.name} build running in place, side view facing right. No treadmill drawn` });
    out.push({ ...base, id: `char.${b}.yoga_tree`, file: `characters/${b}/yoga_tree.png`, width: 64, height: 64, frames: 2, fps: 3, anchor: ACTION_ANCHOR, batch: actionBatch, brief: `${build.name} build in yoga tree pose facing down, slow breathing. No mat drawn` });
    out.push({ ...base, id: `char.${b}.yoga_warrior`, file: `characters/${b}/yoga_warrior.png`, width: 64, height: 64, frames: 2, fps: 3, anchor: ACTION_ANCHOR, batch: actionBatch, brief: `${build.name} build in yoga warrior pose, side view facing right. No mat drawn` });
    out.push({ ...base, id: `char.${b}.yoga_dog`, file: `characters/${b}/yoga_dog.png`, width: 64, height: 64, frames: 2, fps: 3, anchor: ACTION_ANCHOR, batch: actionBatch, brief: `${build.name} build in downward dog, side view facing right. No mat drawn` });
  }
  return out;
};

/** Short helper for still environment sprites. */
const prop = (id: string, width: number, height: number, batch: number, brief: string, phase: 'v1' | 'later' = 'v1'): AssetDef => ({
  id: `prop.${id}`, file: `props/${id}.png`, kind: 'sprite', palette: 'environment', width, height, frames: 1,
  anchor: [Math.floor(width / 2), height - 2], batch, phase, brief,
});

/** Short helper for 32 x 32 floor tiles and wall pieces. */
const tile = (id: string, width: number, height: number, brief: string): AssetDef => ({
  id: `tile.${id}`, file: `tiles/${id}.png`, kind: 'tile', palette: 'environment', width, height, frames: 1,
  anchor: [0, 0], batch: 4, phase: 'v1', brief,
});

/** Short helper for small animated effects and UI pieces. */
const fx = (id: string, width: number, height: number, frames: number, fps: number, brief: string, palette: PaletteName = 'environment'): AssetDef => ({
  id: `fx.${id}`, file: `fx/${id}.png`, kind: frames > 1 ? 'strip' : 'sprite', palette, width, height, frames, fps,
  anchor: [Math.floor(width / 2), height - 1], batch: 8, phase: 'v1', brief,
});

/** Short helper for UI pieces and icons. */
const ui = (id: string, width: number, height: number, brief: string): AssetDef => ({
  id: `ui.${id}`, file: `ui/${id}.png`, kind: 'sprite', palette: 'environment', width, height, frames: 1,
  anchor: [0, 0], batch: 8, phase: 'v1', brief,
});

export const ASSETS: AssetDef[] = [
  // Batch 1: style tile, reference only (not loaded by the game).
  { id: 'ref.style_tile', file: '../art/reference/style-tile.png', kind: 'sprite', palette: 'environment', width: 256, height: 160, frames: 1, anchor: [0, 0], batch: 1, phase: 'v1', brief: 'A small corner of the gym: rubber floor, back wall with a window, a bench with a barbell, a plant, and the Toned agent standing facing down. Sets the look for everything else' },

  ...characterAssets(),

  // Batch 4: floors and walls.
  tile('floor_rubber_1', 32, 32, 'Dark rubber gym floor, seamless, a few lighter flecks'),
  tile('floor_rubber_2', 32, 32, 'Same rubber floor, different fleck pattern, seamless'),
  tile('floor_wood_1', 32, 32, 'Warm wooden floorboards running left to right, seamless'),
  tile('floor_wood_2', 32, 32, 'Same wood, different board joins, seamless'),
  tile('floor_mat_pink', 32, 32, 'Soft pastel pink foam floor square with a thin darker edge, seamless'),
  tile('floor_mat_teal', 32, 32, 'Soft teal foam floor square with a thin darker edge, seamless'),
  tile('wall_back', 32, 64, 'Back wall piece: light grey-lilac wall, wooden skirting board at the bottom, tileable left to right'),
  tile('wall_window', 64, 64, 'Back wall with a big window showing blue sky light, same skirting board'),
  tile('wall_door', 64, 64, 'Back wall with the entrance: a double glass door'),
  tile('wall_side', 8, 32, 'Thin side wall strip seen from above, tileable top to bottom'),
  tile('wall_front', 32, 8, 'Low front ledge seen from above, tileable left to right'),

  // Batch 5: props and machines.
  prop('front_desk', 96, 64, 5, 'Reception desk, wooden top, a small computer screen and a bell, seen from the front'),
  prop('lockers', 32, 64, 5, 'Two tall metal lockers side by side, one door slightly open'),
  prop('locker_room_door', 32, 64, 5, 'Wooden door with a small towel icon plaque (no words)'),
  prop('water_cooler', 32, 48, 5, 'Office water cooler with a big blue bottle on top and a stack of cups'),
  prop('plant_big', 32, 48, 5, 'Big leafy plant in a round pot'),
  prop('plant_small', 32, 32, 5, 'Small plant in a square pot'),
  prop('speaker', 32, 32, 5, 'Wall speaker box, dark with round cones'),
  prop('mirror', 64, 48, 5, 'Wide wall mirror with a light frame and a diagonal shine'),
  prop('poster_dumbbell', 32, 32, 5, 'Wall poster with a big dumbbell icon, no text'),
  prop('poster_heart', 32, 32, 5, 'Wall poster with a big heart icon, no text'),
  prop('poster_bolt', 32, 32, 5, 'Wall poster with a big lightning bolt icon, no text'),
  prop('clock', 32, 32, 5, 'Round wall clock'),
  prop('dumbbell_rack', 64, 32, 5, 'Low rack with pairs of dumbbells in different colours'),
  prop('kettlebells', 32, 32, 5, 'Three kettlebells of different sizes on the floor'),
  prop('bench_back', 64, 48, 5, 'Flat bench press bench, side view, head end on the left, with two upright bar holders. Drawn WITHOUT the barbell'),
  prop('bench_bar', 64, 24, 5, 'Just the barbell with plates, resting horizontally, to sit on the bench holders when nobody is lifting'),
  prop('treadmill_back', 64, 48, 5, 'Treadmill base and belt, side view, console end on the right. The part BEHIND the runner'),
  prop('treadmill_front', 64, 48, 5, 'Treadmill console and the near-side handrail only, side view, console on the right. The part IN FRONT of the runner. Everything else transparent'),
  prop('yoga_mat_pink', 64, 32, 5, 'Yoga mat lying flat, pink, slightly rolled at one end'),
  prop('yoga_mat_teal', 64, 32, 5, 'Yoga mat lying flat, teal, slightly rolled at one end'),
  prop('yoga_mat_purple', 64, 32, 5, 'Yoga mat lying flat, purple, slightly rolled at one end'),
  prop('yoga_mat_green', 64, 32, 5, 'Yoga mat lying flat, green, slightly rolled at one end'),
  prop('squat_rack', 64, 64, 5, 'Squat rack cage with a barbell', 'later'),
  prop('leg_press', 64, 48, 5, 'Leg press machine, side view', 'later'),
  prop('rower', 64, 32, 5, 'Rowing machine, side view', 'later'),
  prop('sparring_ring', 128, 96, 5, 'Small boxing ring with ropes, seen from the front', 'later'),

  // Batch 8: effects.
  fx('sweat', 16, 16, 4, 8, 'A blue sweat drop that appears, slides and fades'),
  fx('cheer', 32, 32, 4, 10, 'A burst of small stars and hearts popping outward'),
  fx('dust', 32, 16, 4, 10, 'A little dust puff on the floor, for a dropped bar'),
  fx('sparkle', 16, 16, 4, 10, 'A yellow sparkle that twinkles, for a personal best'),
  fx('notes', 16, 16, 4, 6, 'Two music notes floating up and fading'),
  fx('headphones_down', 20, 12, 1, 0, 'Over-ear headphones seen from the front, to sit on a head facing down', 'character'),
  fx('headphones_up', 20, 12, 1, 0, 'Over-ear headphones seen from behind', 'character'),
  fx('headphones_side', 20, 12, 1, 0, 'Over-ear headphones seen from the side', 'character'),

  // Batch 8: UI.
  ui('bubble', 24, 24, 'Speech bubble 9-slice: cream fill, ink outline, rounded corners. 8-pixel corners'),
  ui('bubble_tail', 8, 6, 'Speech bubble tail pointing down'),
  ui('bubble_whisper', 24, 24, 'Whisper bubble 9-slice: dotted ink outline, cream fill'),
  ui('bubble_shout', 32, 32, 'Shout bubble 9-slice: spiky outline, yellow fill'),
  ui('name_tag', 16, 12, 'Name tag 9-slice: small ink pill with cream border'),
  ui('line_badge', 12, 12, 'Round yellow badge for a place-in-line number (number added by the game)'),
  ui('progress_frame', 24, 8, 'Progress bar frame 9-slice, ink outline, empty inside'),
  ui('progress_fill', 4, 4, 'Progress bar fill piece, green, stretches'),
  ui('icon_headphones', 16, 16, 'Icon: headphones'),
  ui('icon_note', 16, 16, 'Icon: music note'),
  ui('icon_dumbbell', 16, 16, 'Icon: dumbbell (strength)'),
  ui('icon_heart', 16, 16, 'Icon: heart (stamina)'),
  ui('icon_leaf', 16, 16, 'Icon: leaf (flexibility)'),
  ui('icon_flame', 16, 16, 'Icon: flame (streak)'),
  ui('icon_trophy', 16, 16, 'Icon: trophy (personal best)'),
  ui('icon_clock', 16, 16, 'Icon: clock (time left)'),

  // Batch 9: staff and brand.
  { id: 'npc.mark.idle', file: 'characters/npc-mark/idle_down.png', kind: 'strip', palette: 'character', width: 32, height: 48, frames: 4, fps: 6, anchor: [16, 46], batch: 9, phase: 'v1', brief: 'Mark, the friendly front-desk staff member: Buff build, polo shirt, whistle, cap, standing behind the desk facing down' },
  { id: 'npc.mark.wave', file: 'characters/npc-mark/wave_down.png', kind: 'strip', palette: 'character', width: 32, height: 48, frames: 4, fps: 8, anchor: [16, 46], batch: 9, phase: 'v1', brief: 'Mark waving hello, facing down' },
  // Batch 10: Mark walks over to spot people.
  { id: 'npc.mark.walk_down', file: 'characters/npc-mark/walk_down.png', kind: 'strip', palette: 'character', width: 32, height: 48, frames: 4, fps: 10, anchor: [16, 46], batch: 10, phase: 'v1', brief: 'Mark (Buff build, polo shirt, whistle, cap), walk cycle facing down' },
  { id: 'npc.mark.walk_up', file: 'characters/npc-mark/walk_up.png', kind: 'strip', palette: 'character', width: 32, height: 48, frames: 4, fps: 10, anchor: [16, 46], batch: 10, phase: 'v1', brief: 'Mark, walk cycle facing up (seen from behind)' },
  { id: 'npc.mark.walk_side', file: 'characters/npc-mark/walk_side.png', kind: 'strip', palette: 'character', width: 32, height: 48, frames: 4, fps: 10, anchor: [16, 46], batch: 10, phase: 'v1', brief: 'Mark, walk cycle facing right' },
  { id: 'npc.mark.spot', file: 'characters/npc-mark/spot.png', kind: 'strip', palette: 'character', width: 32, height: 48, frames: 2, fps: 3, anchor: [16, 46], batch: 10, phase: 'v1', brief: 'Mark spotting: side view facing right, leaning forward at the head of a bench, both hands held low ready to catch a barbell. No bench or bar drawn' },

  // Batch 10: the whiteboard, the personal-best bell and the cooler lounge.
  prop('whiteboard', 64, 48, 10, 'Gym whiteboard hung on the back wall: white board in a thin metal frame with a marker tray, covered in scribbled lines and tally marks that suggest a list of lifts. No real letters or numbers'),
  prop('pb_bell', 32, 32, 10, 'Brass bell on a small wall bracket with a short rope, for ringing a personal best'),
  { id: 'fx.bell_ring', file: 'fx/bell_ring.png', kind: 'strip', palette: 'environment', width: 32, height: 32, frames: 4, fps: 10, anchor: [16, 30], batch: 10, phase: 'v1', brief: 'The same brass bell on its bracket, swinging left and right with short curved ring lines on both sides. Drawn in place of prop.pb_bell while it rings' },
  prop('vending_machine', 32, 64, 10, 'Snack and drinks vending machine seen from the front: lit glass front with rows of colourful items, a coin slot, no text'),
  prop('seat_bench', 64, 32, 10, 'Low padded seat bench for resting, seen from the front, no backrest, wooden legs'),

  { id: 'brand.logo', file: 'brand/logo.png', kind: 'sprite', palette: 'environment', width: 256, height: 64, frames: 1, anchor: [0, 0], batch: 9, phase: 'v1', brief: 'BENCHMAXXERS wordmark: chunky bevelled early-2000s game logo letters in yellow with an ink outline and a small dumbbell replacing the dot or crossing the X' },
  { id: 'brand.mark', file: 'brand/mark.png', kind: 'sprite', palette: 'environment', width: 32, height: 32, frames: 1, anchor: [0, 0], batch: 9, phase: 'v1', brief: 'Square app icon: a yellow dumbbell on an ink rounded square' },
  { id: 'brand.recap_bg', file: 'brand/recap_bg.png', kind: 'sprite', palette: 'environment', width: 300, height: 157, frames: 1, anchor: [0, 0], batch: 9, phase: 'v1', brief: 'Background for the shareable visit recap card: gym wall with window on the left half, empty cream panel on the right half for text added by the game' },
];
