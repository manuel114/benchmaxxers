/**
 * How each agent looks. Character art is drawn in one default set of swap
 * colours (art/STYLE.md › Swap colours); here every agent gets its own set,
 * picked from its id, and the sprites are recoloured to match.
 */
import { CHAR, hexToInt } from './pixels.js';

/** A swap ramp from darkest to lightest. */
type Ramp = string[];

/** Skin tones (shadow, base, light). */
const SKIN: Ramp[] = [
  ['#7A4B30', '#B97A52', '#E8B48C'],
  ['#4A2C1E', '#7A4B30', '#B07650'],
  ['#9C6444', '#D9A27A', '#F5CFAE'],
  ['#B5785A', '#EDB896', '#FBDCC4'],
  ['#5C3826', '#94603E', '#C98F64'],
];

/** Hair colours. */
const HAIR: Ramp[] = [
  ['#33201A', '#54362A', '#7A5540'],
  ['#1E1A26', '#2E2838', '#4A4258'],
  ['#9C6A1E', '#D9A441', '#F2D27A'],
  ['#7A2A1A', '#B8482A', '#E07A4A'],
  ['#452A63', '#70489A', '#AE85D2'],
  ['#7F7C97', '#A9A8BE', '#D3D3E0'],
  ['#1C555C', '#2A8188', '#57BAB7'],
];

/** Shirt or tank top colours. */
const TOP: Ramp[] = [
  ['#17506E', '#2479A3', '#63B9E0'],
  ['#7E2A36', '#B8414B', '#E8706A'],
  ['#2A5F47', '#46996A', '#86CB97'],
  ['#A84F26', '#E0813A', '#F5B062'],
  ['#452A63', '#70489A', '#AE85D2'],
  ['#9B4067', '#DB759B', '#F5B6CD'],
  ['#B98B25', '#EDC549', '#FBE5A1'],
  ['#5A5670', '#A9A8BE', '#F4F2EE'],
];

/** Shorts or leggings colours. */
const BOTTOMS: Ramp[] = [
  ['#22243A', '#363959', '#53578A'],
  ['#2B2238', '#3E3450', '#5A5670'],
  ['#283A73', '#3B67B8', '#78ACE3'],
  ['#5E3826', '#8A5636', '#B9814F'],
  ['#2A5F47', '#3D7A5C', '#5FA27C'],
];

/** Shoe colours. */
const SHOES: Ramp[] = [
  ['#A3313E', '#D5525C', '#F0959C'],
  ['#5A5670', '#D3D3E0', '#F4F2EE'],
  ['#2B2238', '#3E3450', '#7F7C97'],
  ['#1C555C', '#2A8188', '#57BAB7'],
  ['#B98B25', '#EDC549', '#FBE5A1'],
];

/** Band colours (dark, light). `null` hides the band by matching the hair or skin under it. */
const BANDS: (Ramp | null)[] = [
  ['#D19A00', '#FFCF3A'],
  ['#0E8F6D', '#47CFA2'],
  ['#A3313E', '#D5525C'],
  ['#3B67B8', '#78ACE3'],
  ['#DB759B', '#F5B6CD'],
  null,
  null,
];

/** One agent's chosen colours. */
export type Appearance = {
  /** Stable key for caching recoloured sprites. */
  key: string;
  /** Default hex → this agent's hex, for every swap colour. */
  swaps: Map<string, string>;
  /** The agent's shirt colour, for name tags and the roster. */
  accent: string;
};

/** A small, stable string hash (FNV-1a). */
export const hashString = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

/** Picks one entry from a list using a few bits of the hash. */
const pick = <T>(list: T[], h: number, shift: number): T => list[(((h >>> shift) ^ (h >>> (shift + 13))) >>> 0) % list.length]!;

/** Maps a default ramp (by palette names) onto a chosen ramp. */
const mapRamp = (out: Map<string, string>, names: string[], to: Ramp): void => {
  names.forEach((n, i) => out.set(CHAR[n]!, to[i]!.toUpperCase()));
};

/** The colours for one agent, derived from its id so they're the same for every viewer. */
export const appearanceFor = (agentId: string): Appearance => {
  const h = hashString(agentId);
  const h2 = hashString(`${agentId}:2`);
  const skin = pick(SKIN, h, 0);
  const hair = pick(HAIR, h, 3);
  const top = pick(TOP, h, 6);
  const bottoms = pick(BOTTOMS, h2, 0);
  const shoes = pick(SHOES, h2, 3);
  const headband = pick(BANDS, h2, 6) ?? [hair[1]!, hair[2]!];
  const wristband = pick(BANDS, h2, 9) ?? [skin[1]!, skin[2]!];

  const swaps = new Map<string, string>();
  mapRamp(swaps, ['skin-1', 'skin-2', 'skin-3'], skin);
  mapRamp(swaps, ['hair-1', 'hair-2', 'hair-3'], hair);
  mapRamp(swaps, ['top-1', 'top-2', 'top-3'], top);
  mapRamp(swaps, ['bottoms-1', 'bottoms-2', 'bottoms-3'], bottoms);
  mapRamp(swaps, ['shoes-1', 'shoes-2', 'shoes-3'], shoes);
  mapRamp(swaps, ['headband-1', 'headband-2'], headband);
  mapRamp(swaps, ['wristband-1', 'wristband-2'], wristband);
  const key = [...swaps.values()].join('');
  return { key, swaps, accent: top[1]! };
};

/** Recolours RGBA pixel data in place: every pixel whose colour is a key of `swaps` becomes its value. */
export const recolor = (data: Uint8ClampedArray, swaps: Map<string, string>): void => {
  const table = new Map<number, number>();
  for (const [from, to] of swaps) table.set(hexToInt(from), hexToInt(to));
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const to = table.get((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    if (to === undefined) continue;
    data[i] = (to >> 16) & 255;
    data[i + 1] = (to >> 8) & 255;
    data[i + 2] = to & 255;
  }
};
