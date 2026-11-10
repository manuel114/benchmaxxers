import { describe, expect, it } from 'vitest';
import { appearanceFor, recolor } from './appearance.js';
import { CHAR, hexToInt } from './pixels.js';

describe('appearance', () => {
  it('gives every id a full set of swap colours, the same every time', () => {
    for (let i = 0; i < 500; i++) {
      const id = `agt_${i.toString(36)}_${i * 7919}`;
      const a = appearanceFor(id);
      expect(a.swaps.size).toBe(19);
      for (const v of a.swaps.values()) expect(v).toMatch(/^#[0-9A-F]{6}$/);
      expect(appearanceFor(id).key).toBe(a.key);
    }
  });

  it('varies between agents', () => {
    const keys = new Set(Array.from({ length: 50 }, (_, i) => appearanceFor(`agt_${i}`).key));
    expect(keys.size).toBeGreaterThan(40);
  });

  it('recolours only swap colours', () => {
    const data = new Uint8ClampedArray(8);
    const put = (i: number, hex: string) => { const n = hexToInt(hex); data.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], i * 4); };
    put(0, CHAR['top-2']!);
    put(1, CHAR.ink!);
    recolor(data, new Map([[CHAR['top-2']!, '#123456']]));
    expect([...data.slice(0, 3)]).toEqual([0x12, 0x34, 0x56]);
    expect([...data.slice(4, 7)]).toEqual([0x2b, 0x22, 0x38]);
  });
});
