import { describe, expect, it } from 'vitest';
import { blank, at, type Image } from './image.js';
import { loadPalette } from './palette.js';
import { cleanStrip, cleanSprite, cleanTile, checkImage, estimateScale, toIndexed } from './pixelize.js';

const palette = loadPalette('character');
/** Ink, skin and shirt colours from the character palette. */
const INK = palette[0]!, SKIN = palette[8]!, SHIRT = palette[14]!;

/** Draws a tiny 6x10 figure, scaled up with uneven block sizes and slightly off colours, like an image model would. */
const fakeGenerated = (frames: number, k: number, lift: number[] = []): Image => {
  const figure = [
    '.IIII.', 'ISSSSI', 'ISISIS', 'ISSSSI', '.IIII.', 'IBBBBI', 'IBBBBI', 'IBBBBI', '.I..I.', '.I..I.',
  ];
  const img = blank(frames * 12 * k, 14 * k);
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 255; img.data[i + 1] = 0; img.data[i + 2] = 255; img.data[i + 3] = 255; }
  for (let f = 0; f < frames; f++) {
    figure.forEach((row, ry) => [...row].forEach((ch, rx) => {
      if (ch === '.') return;
      const c = ch === 'I' ? INK : ch === 'S' ? SKIN : SHIRT;
      // Uneven blocks: every third block is one pixel wider.
      const x0 = f * 12 * k + 3 * k + rx * k + Math.floor(rx / 3);
      const y0 = 2 * k + (ry - (lift[f] ?? 0)) * k;
      for (let y = y0; y < y0 + k; y++) for (let x = x0; x < x0 + k + (rx % 3 === 2 ? 1 : 0); x++) {
        const i = at(img, x, y);
        img.data[i] = Math.min(255, c[0] + 4); img.data[i + 1] = Math.max(0, c[1] - 3); img.data[i + 2] = c[2];
      }
    }));
  }
  return img;
};

describe('pixelize', () => {
  it('guesses the block size of upscaled pixel art', () => {
    expect(estimateScale(toIndexed(fakeGenerated(1, 8), palette, true))).toBe(8);
  });

  it('cleans a strip into cells with the feet on the anchor row and only palette colours', () => {
    const res = cleanStrip(fakeGenerated(4, 8), palette, { frames: 4, frameW: 32, frameH: 48, anchor: [16, 46] });
    expect(res.image.width).toBe(128);
    expect(res.image.height).toBe(48);
    expect(checkImage(res.image, palette)).toEqual([]);
    // Bottom row of the figure lands on row 46 in every frame.
    for (let f = 0; f < 4; f++) {
      let found = false;
      for (let x = f * 32; x < f * 32 + 32; x++) if (res.image.data[at(res.image, x, 46) + 3] === 255) found = true;
      expect(found).toBe(true);
      expect(res.image.data[at(res.image, f * 32 + 16, 47) + 3]).toBe(0);
    }
  });

  it('keeps a jumping frame higher than the others', () => {
    const res = cleanStrip(fakeGenerated(2, 8, [0, 2]), palette, { frames: 2, frameW: 32, frameH: 48, anchor: [16, 46] });
    /** Lowest solid row in a frame. */
    const bottom = (f: number) => {
      for (let y = 47; y >= 0; y--) for (let x = f * 32; x < f * 32 + 32; x++) if (res.image.data[at(res.image, x, y) + 3] === 255) return y;
      return -1;
    };
    expect(bottom(0)).toBe(46);
    expect(bottom(1)).toBe(44);
  });

  it('places a sprite bottom-centre in its canvas', () => {
    const res = cleanSprite(fakeGenerated(1, 8), palette, { width: 16, height: 16 });
    expect(res.image.width).toBe(16);
    expect(checkImage(res.image, palette, { width: 16, height: 16 })).toEqual([]);
  });

  it('shrinks a full-canvas tile to the exact size', () => {
    const img = blank(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = SKIN[0]; img.data[i + 1] = SKIN[1]; img.data[i + 2] = SKIN[2]; img.data[i + 3] = 255; }
    const res = cleanTile(img, palette, { width: 32, height: 32 });
    expect(checkImage(res.image, palette, { width: 32, height: 32 })).toEqual([]);
  });

  it('reports half-transparent and off-palette pixels', () => {
    const img = blank(2, 1);
    img.data.set([1, 2, 3, 128], 0);
    expect(checkImage(img, palette).length).toBe(2);
  });
});
