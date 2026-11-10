import { describe, expect, it } from 'vitest';
import { ASSETS } from '@benchmaxxers/shared/assets';
import { drawFigure, drawPlaceholder } from './placeholders.js';
import { PALETTE_HEXES } from './pixels.js';

/** Every image the game loads (the style tile is reference only). */
const GAME_ASSETS = ASSETS.filter((a) => !a.file.startsWith('..'));

describe('placeholder art', () => {
  it('draws every asset at its manifest size, in its own palette only', () => {
    for (const a of GAME_ASSETS) {
      const px = drawPlaceholder(a);
      expect([px.width, px.height], a.id).toEqual([a.width * a.frames, a.height]);
      const allowed = PALETTE_HEXES[a.palette];
      const solid = new Set<string>();
      for (let y = 0; y < px.height; y++) for (let x = 0; x < px.width; x++) { const c = px.get(x, y); if (c) solid.add(c); }
      expect(solid.size, `${a.id} is empty`).toBeGreaterThan(0);
      for (const c of solid) expect(allowed.has(c), `${a.id} uses ${c}`).toBe(true);
    }
  });

  /** Frame 0 of a character's idle placeholder, as the game draws it. */
  const idle = (build: 0 | 1 | 2 | 3, dir: 'down' | 'up' | 'side') => {
    const def = ASSETS.find((a) => a.id === `char.build-${build}.idle_${dir}`)!;
    return drawPlaceholder(def);
  };

  it('puts character feet on row 22 of the 16 x 24 frame, centred on column 8, with an empty row below', () => {
    for (const build of [0, 1, 2, 3] as const) {
      for (const dir of ['down', 'up', 'side'] as const) {
        const px = idle(build, dir);
        const xs: number[] = [];
        for (let x = 0; x < 16; x++) if (px.get(x, 22)) xs.push(x);
        expect(xs.length, `build ${build} ${dir}`).toBeGreaterThan(0);
        for (let x = 0; x < 16; x++) expect(px.get(x, 23), `build ${build} ${dir}`).toBeNull();
        expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 8), `build ${build} ${dir}`).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('makes builds wider as they get stronger', () => {
    const width = (b: 0 | 1 | 2 | 3) => {
      const px = idle(b, 'down');
      let min = 16, max = 0;
      for (let x = 0; x < 16; x++) if (px.get(x, 14)) { min = Math.min(min, x); max = Math.max(max, x); }
      return max - min;
    };
    expect(width(0)).toBeLessThanOrEqual(width(1));
    expect(width(1)).toBeLessThan(width(2));
    expect(width(2)).toBeLessThanOrEqual(width(3));
  });

  it('keeps the double-size drawing in proportion', () => {
    expect(drawFigure(1, { dir: 'down' }).bottomRow()).toBe(46);
  });
});
