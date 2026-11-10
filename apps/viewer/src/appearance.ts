/**
 * How each agent looks. Character art is drawn in one default set of swap
 * colours (art/STYLE.md › Swap colours). Each agent's saved appearance comes
 * from the server (packages/shared/src/appearance.ts), and the sprites are
 * recoloured to match it.
 */
import {
  HAIR_RAMPS, OUTFIT_RAMPS, SKIN_RAMPS, appearanceFromSeed,
  type AgentView, type Appearance as SavedLook,
} from '@benchmaxxers/shared';
import { CHAR, hexToInt } from './pixels.js';

/** One agent's colours, ready for recolouring sprites. */
export type Appearance = {
  /** Stable key for caching recoloured sprites. */
  key: string;
  /** Default hex → this agent's hex, for every swap colour. */
  swaps: Map<string, string>;
  /** The agent's shirt colour, for name tags and the roster. */
  accent: string;
  /** The saved look this was built from, to notice when it changes. */
  source: SavedLook | undefined;
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

/** Maps a default ramp (by palette names) onto a chosen ramp. */
const mapRamp = (out: Map<string, string>, names: string[], to: readonly string[]): void => {
  names.forEach((n, i) => out.set(CHAR[n]!, to[i]!.toUpperCase()));
};

/** The colours for one agent, from its saved look (or, for an older server, one derived from its id). */
export const appearanceFor = (agent: Pick<AgentView, 'id'> & { appearance?: SavedLook }): Appearance => {
  const look = agent.appearance ?? appearanceFromSeed(agent.id);
  const skin = SKIN_RAMPS[look.skin];
  const hair = HAIR_RAMPS[look.hair];
  // A hidden headband takes the colour underneath it: hair, or skin on a bald head.
  const underBand = look.hairstyle === 'bald' ? skin : hair;
  const headband = look.headband === 'none' ? underBand.slice(1) : OUTFIT_RAMPS[look.headband].slice(1);
  const wristband = look.wristbands === 'none' ? skin.slice(1) : OUTFIT_RAMPS[look.wristbands].slice(1);

  const swaps = new Map<string, string>();
  mapRamp(swaps, ['skin-1', 'skin-2', 'skin-3'], skin);
  mapRamp(swaps, ['hair-1', 'hair-2', 'hair-3'], hair);
  mapRamp(swaps, ['top-1', 'top-2', 'top-3'], OUTFIT_RAMPS[look.top]);
  mapRamp(swaps, ['bottoms-1', 'bottoms-2', 'bottoms-3'], OUTFIT_RAMPS[look.bottoms]);
  mapRamp(swaps, ['shoes-1', 'shoes-2', 'shoes-3'], OUTFIT_RAMPS[look.shoes]);
  mapRamp(swaps, ['headband-1', 'headband-2'], headband);
  mapRamp(swaps, ['wristband-1', 'wristband-2'], wristband);
  const key = [...swaps.values()].join('');
  return { key, swaps, accent: OUTFIT_RAMPS[look.top][1], source: agent.appearance };
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
