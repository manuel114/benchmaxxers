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

  it('puts character feet on row 46, centred on column 16, in every build and direction', () => {
    for (const build of [0, 1, 2, 3] as const) {
      for (const dir of ['down', 'up', 'side'] as const) {
        const px = drawFigure(build, { dir });
        expect(px.bottomRow(), `build ${build} ${dir}`).toBe(46);
        const xs: number[] = [];
        for (let x = 0; x < 32; x++) if (px.get(x, 46)) xs.push(x);
        expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 16), `build ${build} ${dir}`).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('makes builds wider as they get stronger', () => {
    const width = (b: 0 | 1 | 2 | 3) => {
      const px = drawFigure(b, { dir: 'down' });
      let min = 32, max = 0;
      for (let x = 0; x < 32; x++) if (px.get(x, 28)) { min = Math.min(min, x); max = Math.max(max, x); }
      return max - min;
    };
    expect(width(0)).toBeLessThan(width(1));
    expect(width(1)).toBeLessThan(width(2));
    expect(width(2)).toBeLessThan(width(3));
  });
});
