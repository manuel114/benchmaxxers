import { describe, expect, it } from 'vitest';
import { nineSlices } from './nine.js';

/** Counts how many slices cover each target pixel. */
const coverage = (w: number, h: number, slices: ReturnType<typeof nineSlices>): number[] => {
  const hits = new Array<number>(w * h).fill(0);
  for (const s of slices) for (let y = s.dy; y < s.dy + s.dh; y++) for (let x = s.dx; x < s.dx + s.dw; x++) hits[y * w + x]!++;
  return hits;
};

describe('nineSlices', () => {
  it.each([[24, 24, 24, 24], [24, 24, 104, 48], [24, 24, 37, 29], [24, 8, 44, 8], [16, 12, 61, 10]])(
    'covers a %ix%i image stretched to %ix%i exactly once',
    (srcW, srcH, w, h) => {
      const insets: [number, number] = srcH === 8 ? [8, 2] : srcW === 16 ? [4, 4] : [8, 8];
      const slices = nineSlices(srcW, srcH, insets, w, h);
      const W = Math.max(w, 2 * insets[0] + 1);
      const H = Math.max(h, 2 * insets[1] + 1);
      expect(coverage(W, H, slices).every((n) => n === 1)).toBe(true);
    },
  );

  it('keeps corners and edges at their own size, so only the centre stretches', () => {
    const slices = nineSlices(24, 24, [8, 8], 56, 32);
    for (const s of slices) {
      const centre = s.dx === 8 && s.dy === 8;
      if (!centre) { expect(s.dw).toBe(s.sw); expect(s.dh).toBe(s.sh); }
    }
  });

  it('never reads outside the source image', () => {
    for (const s of nineSlices(24, 24, [8, 8], 101, 47)) {
      expect(s.sx + s.sw).toBeLessThanOrEqual(24);
      expect(s.sy + s.sh).toBeLessThanOrEqual(24);
    }
  });
});
