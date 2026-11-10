/** Cosmetic choices stay independent of strength, animation and exercise scoring. */
export const HAIRSTYLES = ['crop', 'curls', 'bob', 'bun', 'bald'] as const;
export type Hairstyle = (typeof HAIRSTYLES)[number];
export type ColorRamp = readonly [string, string, string];

/** Runtime swap colors; the source sprite always uses art/palettes/character.json. */
export const SKIN_RAMPS = {
  fair: ['#BE8B78', '#E3BBA3', '#F7DDC4'],
  light: ['#A57451', '#D6A477', '#F1CCA5'],
  medium: ['#7A4B30', '#B97A52', '#E8B48C'],
  tan: ['#6E4932', '#A5754C', '#D3A675'],
  deep: ['#422C27', '#734D3D', '#A8795B'],
  dark: ['#2F2529', '#503A34', '#7C5745'],
} as const satisfies Record<string, ColorRamp>;

export const HAIR_RAMPS = {
  brown: ['#33201A', '#54362A', '#7A5540'],
  black: ['#242032', '#383344', '#5B5265'],
  blond: ['#93642D', '#C69A4E', '#E9CB83'],
  auburn: ['#572A24', '#8B4330', '#BC7048'],
  silver: ['#57586C', '#9293A5', '#D3D3E0'],
  purple: ['#452A63', '#70489A', '#AE85D2'],
} as const satisfies Record<string, ColorRamp>;

export const OUTFIT_RAMPS = {
  blue: ['#17506E', '#2479A3', '#63B9E0'],
  navy: ['#22243A', '#363959', '#53578A'],
  red: ['#A3313E', '#D5525C', '#F0959C'],
  teal: ['#1C555C', '#2A8188', '#57BAB7'],
  green: ['#0A5D46', '#0E8F6D', '#47CFA2'],
  yellow: ['#9F6D00', '#D19A00', '#FFCF3A'],
  purple: ['#452A63', '#70489A', '#AE85D2'],
  pink: ['#9B4067', '#DB759B', '#F5B6CD'],
  cream: ['#7F7C97', '#D3D3E0', '#F4F2EE'],
} as const satisfies Record<string, ColorRamp>;

type OutfitColor = keyof typeof OUTFIT_RAMPS;
export type Appearance = {
  hairstyle: Hairstyle;
  skin: keyof typeof SKIN_RAMPS;
  hair: keyof typeof HAIR_RAMPS;
  top: OutfitColor;
  bottoms: OutfitColor;
  shoes: OutfitColor;
  headband: OutfitColor | 'none';
  wristbands: OutfitColor | 'none';
};
export type AppearancePatch = Partial<Appearance>;

const outfitColors = Object.keys(OUTFIT_RAMPS) as OutfitColor[];
/** Public catalog used by clients and by validation; no arbitrary hex input. */
export const APPEARANCE_CHOICES = {
  hairstyle: HAIRSTYLES,
  skin: Object.keys(SKIN_RAMPS) as Appearance['skin'][],
  hair: Object.keys(HAIR_RAMPS) as Appearance['hair'][],
  top: outfitColors,
  bottoms: outfitColors,
  shoes: outfitColors,
  headband: [...outfitColors, 'none'] as Appearance['headband'][],
  wristbands: [...outfitColors, 'none'] as Appearance['wristbands'][],
} as const;

/** Matches every original source-sprite color, for references and renderer tests. */
export const DEFAULT_APPEARANCE: Appearance = {
  hairstyle: 'crop', skin: 'medium', hair: 'brown', top: 'blue', bottoms: 'navy',
  shoes: 'red', headband: 'yellow', wristbands: 'green',
};

export class AppearanceError extends Error {}

/** Validates partial changes without accepting gameplay fields or unknown choices. */
export const parseAppearancePatch = (value: unknown): AppearancePatch => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppearanceError('Appearance must be an object of cosmetic choices.');
  }
  const entries = Object.entries(value);
  if (entries.length === 0) throw new AppearanceError('Choose at least one appearance field.');
  const patch: Record<string, string> = {};
  for (const [part, choice] of entries) {
    if (!Object.hasOwn(APPEARANCE_CHOICES, part)) throw new AppearanceError(`Unknown appearance field: ${part}.`);
    const choices: readonly string[] = APPEARANCE_CHOICES[part as keyof Appearance];
    if (typeof choice !== 'string' || !choices.includes(choice)) {
      throw new AppearanceError(`Choose ${part} from: ${choices.join(', ')}.`);
    }
    patch[part] = choice;
  }
  return patch as AppearancePatch;
};

/** Stable across sessions and platforms. A new random agent id gives a random look. */
export const appearanceFromSeed = (seed: string): Appearance => {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  const pick = <K extends keyof Appearance>(part: K): Appearance[K] => {
    state = (state + 0x6D2B79F5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    const fraction = ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    const choices = APPEARANCE_CHOICES[part];
    return choices[Math.floor(fraction * choices.length)] as Appearance[K];
  };
  return {
    hairstyle: pick('hairstyle'), skin: pick('skin'), hair: pick('hair'), top: pick('top'),
    bottoms: pick('bottoms'), shoes: pick('shoes'), headband: pick('headband'), wristbands: pick('wristbands'),
  };
};

const rgb = (hex: string): readonly [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
};

/**
 * Recolors a character layer from its original source palette in a single pass.
 * Draw the selected hair geometry separately; this helper does not invent hair art.
 * Ink, eyes, blush, metal and alpha remain unchanged. Never recolor a whole scene.
 */
export const recolorCharacterPixels = (pixels: Uint8Array | Uint8ClampedArray, appearance: Appearance): Uint8ClampedArray => {
  if (pixels.length % 4 !== 0) throw new AppearanceError('Character pixels must be RGBA.');
  const swaps = new Map<number, readonly [number, number, number]>();
  const add = (source: readonly string[], target: readonly string[]) => {
    source.forEach((hex, i) => swaps.set(Number.parseInt(hex.slice(1), 16), rgb(target[i]!)));
  };
  add(SKIN_RAMPS.medium, SKIN_RAMPS[appearance.skin]);
  add(HAIR_RAMPS.brown, HAIR_RAMPS[appearance.hair]);
  add(OUTFIT_RAMPS.blue, OUTFIT_RAMPS[appearance.top]);
  add(OUTFIT_RAMPS.navy, OUTFIT_RAMPS[appearance.bottoms]);
  add(OUTFIT_RAMPS.red, OUTFIT_RAMPS[appearance.shoes]);
  const scalp = appearance.hairstyle === 'bald' ? SKIN_RAMPS[appearance.skin] : HAIR_RAMPS[appearance.hair];
  add(['#D19A00', '#FFCF3A'], (appearance.headband === 'none' ? scalp : OUTFIT_RAMPS[appearance.headband]).slice(1));
  add(['#0E8F6D', '#47CFA2'], (appearance.wristbands === 'none' ? SKIN_RAMPS[appearance.skin] : OUTFIT_RAMPS[appearance.wristbands]).slice(1));
  const out = new Uint8ClampedArray(pixels);
  for (let i = 0; i < out.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const color = swaps.get((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!);
    if (color) out.set(color, i);
  }
  return out;
};
