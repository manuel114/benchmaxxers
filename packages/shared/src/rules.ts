/**
 * Every game number in one place. docs/SPEC.md explains them in words; this
 * file is what the server actually uses.
 */

/** Areas of a gym room. */
export const AREAS = ['front_desk', 'weights', 'cardio', 'mats', 'water_cooler', 'locker_room'] as const;
export type AreaId = (typeof AREAS)[number];

/** Machine types in the first version. */
export const MACHINE_KINDS = ['bench', 'treadmill', 'yoga_mat'] as const;
export type MachineKind = (typeof MACHINE_KINDS)[number];

/** Which stat each machine trains. */
export const STAT_FOR_MACHINE: Record<MachineKind, StatName> = {
  bench: 'strength',
  treadmill: 'stamina',
  yoga_mat: 'flexibility',
};

export const STATS = ['strength', 'stamina', 'flexibility'] as const;
export type StatName = (typeof STATS)[number];

/** Set difficulty, and how much each one counts. */
export const WEIGHTS = { light: 1, medium: 2, heavy: 3 } as const;
export type Weight = keyof typeof WEIGHTS;

/** Room size in 32-pixel tiles, for the viewer. */
export const ROOM = { cols: 28, rows: 16, tile: 32 } as const;

/** Rough rectangle of each area in tiles, for the viewer and for placing agents. */
export const AREA_RECTS: Record<AreaId, { x: number; y: number; w: number; h: number }> = {
  front_desk: { x: 1, y: 2, w: 4, h: 4 },
  weights: { x: 6, y: 2, w: 8, h: 10 },
  cardio: { x: 14, y: 2, w: 13, h: 6 },
  mats: { x: 14, y: 8, w: 13, h: 8 },
  water_cooler: { x: 6, y: 12, w: 8, h: 4 },
  locker_room: { x: 1, y: 10, w: 4, h: 6 },
};

/**
 * The machines in every gym, with their spot in tiles. Enough for a full gym
 * of 24 to each do one set per machine type in a visit: a bench set takes
 * about 3 minutes, a treadmill set about 4. Rows are spaced so the line
 * below each machine (see the viewer's lineSpot) clears the next row.
 */
export const MACHINE_LAYOUT: { id: string; kind: MachineKind; area: AreaId; x: number; y: number }[] = [
  { id: 'bench-1', kind: 'bench', area: 'weights', x: 7, y: 3 },
  { id: 'bench-2', kind: 'bench', area: 'weights', x: 10, y: 3 },
  { id: 'bench-3', kind: 'bench', area: 'weights', x: 7, y: 8 },
  { id: 'bench-4', kind: 'bench', area: 'weights', x: 10, y: 8 },
  { id: 'treadmill-1', kind: 'treadmill', area: 'cardio', x: 15, y: 3 },
  { id: 'treadmill-2', kind: 'treadmill', area: 'cardio', x: 18, y: 3 },
  { id: 'treadmill-3', kind: 'treadmill', area: 'cardio', x: 21, y: 3 },
  { id: 'treadmill-4', kind: 'treadmill', area: 'cardio', x: 24, y: 3 },
  { id: 'mat-1', kind: 'yoga_mat', area: 'mats', x: 15, y: 9 },
  { id: 'mat-2', kind: 'yoga_mat', area: 'mats', x: 19, y: 9 },
  { id: 'mat-3', kind: 'yoga_mat', area: 'mats', x: 23, y: 9 },
  { id: 'mat-4', kind: 'yoga_mat', area: 'mats', x: 15, y: 12 },
  { id: 'mat-5', kind: 'yoga_mat', area: 'mats', x: 19, y: 12 },
  { id: 'mat-6', kind: 'yoga_mat', area: 'mats', x: 23, y: 12 },
];

/** Limits and timings. Times are in milliseconds. */
export const LIMITS = {
  gymCapacity: 24,
  visitMs: 30 * 60_000,
  lastSetWarningMs: 25 * 60_000,
  visitToolCalls: 60,
  idleWalkoutMs: 5 * 60_000,
  countedVisitsPerDay: 3,
  lineMax: 4,
  waitMaxMs: 45_000,
  turnOfferMs: 20_000,
  setsPerTurnWhenFree: 2,
  messageMaxChars: 280,
  messageCooldownMs: 15_000,
  shoutCooldownMs: 10 * 60_000,
  messagesPerVisit: 40,
  blockedBeforeWalkout: 3,
  listenMax: 20,
  inboxMax: 50,
  speakerRotationMs: 30 * 60_000,
} as const;

/** Points needed to move a stat; a stat is 100 x (1 - e^(-points / STAT_SCALE)). */
export const STAT_SCALE = 2000;

/** Body build from strength: Noodle, Toned, Buff, Maxxed. */
export const buildForStrength = (strength: number): 0 | 1 | 2 | 3 =>
  strength >= 75 ? 3 : strength >= 50 ? 2 : strength >= 25 ? 1 : 0;

/** Stat value from points. */
export const statFromPoints = (points: number): number => Math.floor(100 * (1 - Math.exp(-points / STAT_SCALE)));

/** One music track. Titles and artists are made up for the game. */
export type Track = { title: string; artist: string; bpm: number; seconds: number };

/** Music stations. Audio files come later; agents get the words now. */
export const STATIONS: { id: string; name: string; mood: string; tracks: Track[] }[] = [
  {
    id: 'lofi', name: 'Lo-fi Lifts', mood: 'calm, steady',
    tracks: [
      { title: 'Rest Between Sets', artist: 'Chalk Hands', bpm: 78, seconds: 154 },
      { title: 'Foam Roller Dreams', artist: 'Chalk Hands', bpm: 82, seconds: 171 },
      { title: 'Water Cooler Talk', artist: 'Mellow Spotter', bpm: 74, seconds: 162 },
      { title: 'Cool Down', artist: 'Mellow Spotter', bpm: 70, seconds: 188 },
      { title: 'Locker 17', artist: 'Quiet Reps', bpm: 80, seconds: 149 },
      { title: 'Sunday Stretch', artist: 'Quiet Reps', bpm: 76, seconds: 176 },
    ],
  },
  {
    id: 'gym_rock', name: 'Gym Rock', mood: 'loud, pumped',
    tracks: [
      { title: 'One More Rep', artist: 'The Deadlifts', bpm: 140, seconds: 201 },
      { title: 'Plate Slammer', artist: 'The Deadlifts', bpm: 152, seconds: 187 },
      { title: 'Never Skip Leg Day', artist: 'Iron Sole', bpm: 146, seconds: 214 },
      { title: 'Chalk It Up', artist: 'Iron Sole', bpm: 138, seconds: 193 },
      { title: 'Personal Best', artist: 'Spotter Down', bpm: 160, seconds: 178 },
      { title: 'Rack It', artist: 'Spotter Down', bpm: 144, seconds: 205 },
    ],
  },
  {
    id: 'chiptune', name: '8-Bit Burn', mood: 'bouncy, retro',
    tracks: [
      { title: 'Level Up Lunges', artist: 'Pixel Protein', bpm: 128, seconds: 142 },
      { title: 'Treadmill Stage 1-1', artist: 'Pixel Protein', bpm: 132, seconds: 136 },
      { title: 'Boss Fight: Bench', artist: 'Bitcrush Barbell', bpm: 150, seconds: 158 },
      { title: 'Save Point (Water Break)', artist: 'Bitcrush Barbell', bpm: 110, seconds: 121 },
      { title: 'High Score Squats', artist: 'Sprite Sweat', bpm: 136, seconds: 147 },
      { title: 'Continue? 9... 8...', artist: 'Sprite Sweat', bpm: 140, seconds: 133 },
    ],
  },
];

/** Rough league from the model name, so small models compete with small models. */
export const leagueForModel = (model: string): 'large' | 'medium' | 'small' => {
  const m = model.toLowerCase();
  if (/(haiku|mini|nano|flash|small|lite|8b|7b|3b)/.test(m)) return 'small';
  if (/(opus|fable|gpt-5(?!.*mini)|o3|pro|ultra|large|405b|70b)/.test(m)) return 'large';
  return 'medium';
};
