import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  APPEARANCE_CHOICES, DEFAULT_APPEARANCE, HAIR_RAMPS, OUTFIT_RAMPS, SKIN_RAMPS,
  appearanceFromSeed, parseAppearancePatch, recolorCharacterPixels,
} from '@benchmaxxers/shared';

const pixels = (...colors: string[]) => new Uint8Array(colors.flatMap((hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >>> 16) & 255, (n >>> 8) & 255, n & 255, 255];
}));

describe('appearance choices', () => {
  it('gives stable, varied defaults without depending on visit order or stats', () => {
    const looks = Array.from({ length: 1000 }, (_, i) => appearanceFromSeed(`agent-${i}`));
    expect(appearanceFromSeed('agent-42')).toEqual(looks[42]);
    expect(new Set(looks.map((look) => JSON.stringify(look))).size).toBeGreaterThan(990);
    for (const look of looks) expect(parseAppearancePatch(look)).toEqual(look);
    expect(new Set(looks.map((look) => look.hairstyle))).toEqual(new Set(APPEARANCE_CHOICES.hairstyle));
    expect(new Set(looks.map((look) => look.topStyle))).toEqual(new Set(APPEARANCE_CHOICES.topStyle));
    expect(new Set(looks.map((look) => look.bottomsStyle))).toEqual(new Set(APPEARANCE_CHOICES.bottomsStyle));
    expect(new Set(looks.map((look) => `${look.topStyle}/${look.bottomsStyle}`)).size).toBe(9);
  });

  it('keeps the original seeded hairstyle and colors when clothing options are added', () => {
    expect(appearanceFromSeed('agent-42')).toMatchObject({
      hairstyle: 'crop', skin: 'fair', hair: 'purple', top: 'red', bottoms: 'yellow',
      shoes: 'yellow', headband: 'yellow', wristbands: 'none',
    });
  });

  it('accepts partial choices and rejects arbitrary colors and gameplay changes', () => {
    expect(parseAppearancePatch({ hairstyle: 'curls', top: 'teal' })).toEqual({ hairstyle: 'curls', top: 'teal' });
    expect(parseAppearancePatch({ topStyle: 'hoodie', bottomsStyle: 'leggings' })).toEqual({ topStyle: 'hoodie', bottomsStyle: 'leggings' });
    for (const invalid of [null, [], 'blue', {}, { skin: '#fff' }, { hairstyle: 'unknown' }, { hair: null }, { build: 3 }, { top: 'red', points: 900 }, { topStyle: 'blue' }, { bottomsStyle: 'jeans' }, { top: 'hoodie' }]) {
      expect(() => parseAppearancePatch(invalid)).toThrow();
    }
  });
});

describe('source-palette recoloring', () => {
  it('preserves the actual source palette exactly for the reference appearance', () => {
    const palette = JSON.parse(readFileSync(new URL('../../../art/palettes/character.json', import.meta.url), 'utf8')) as { colors: { hex: string }[] };
    const source = pixels(...palette.colors.map((c) => c.hex));
    expect([...recolorCharacterPixels(source, DEFAULT_APPEARANCE)]).toEqual([...source]);
  });

  it('changes only the requested body-part ramp, once, without mutating the source', () => {
    const colors = [...OUTFIT_RAMPS.blue, ...OUTFIT_RAMPS.red, '#2B2238', '#F2A0A8', '#7F7C97'];
    const source = pixels(...colors);
    const before = [...source];
    const out = recolorCharacterPixels(source, { ...DEFAULT_APPEARANCE, top: 'red', shoes: 'teal' });
    expect([...out]).toEqual([...pixels(...OUTFIT_RAMPS.red, ...OUTFIT_RAMPS.teal, '#2B2238', '#F2A0A8', '#7F7C97')]);
    expect([...source]).toEqual(before);
  });

  it('hides accessories in the chosen hair/skin ramps, including a bald scalp', () => {
    const source = pixels('#D19A00', '#FFCF3A', '#0E8F6D', '#47CFA2');
    const look = { ...DEFAULT_APPEARANCE, hair: 'silver', skin: 'dark', headband: 'none', wristbands: 'none' } as const;
    expect([...recolorCharacterPixels(source, look)]).toEqual([...pixels(...HAIR_RAMPS.silver.slice(1), ...SKIN_RAMPS.dark.slice(1))]);
    expect([...recolorCharacterPixels(source, { ...look, hairstyle: 'bald' })]).toEqual([...pixels(...SKIN_RAMPS.dark.slice(1), ...SKIN_RAMPS.dark.slice(1))]);
  });

  it('preserves alpha and transparent pixels', () => {
    const source = pixels('#2479A3', '#2479A3');
    source[3] = 0;
    source[7] = 128;
    const out = recolorCharacterPixels(source, { ...DEFAULT_APPEARANCE, top: 'red' });
    expect([...out.slice(0, 4)]).toEqual([...source.slice(0, 4)]);
    expect([...out.slice(4)]).toEqual([...pixels(OUTFIT_RAMPS.red[1]).slice(0, 3), 128]);
  });
});
