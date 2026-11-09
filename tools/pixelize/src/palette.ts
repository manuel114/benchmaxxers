import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

/** One palette colour as RGB numbers. */
export type Rgb = [number, number, number];

/** Repo root, found from this file's location. */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Loads a named palette from art/palettes. */
export const loadPalette = (name: string): Rgb[] => {
  const json = JSON.parse(readFileSync(join(REPO_ROOT, 'art', 'palettes', `${name}.json`), 'utf8')) as { colors: { hex: string }[] };
  return json.colors.map((c) => hexToRgb(c.hex));
};

/** Turns `#RRGGBB` into RGB numbers. */
export const hexToRgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Perceptual-ish colour distance ("redmean"), cheap and good enough for snapping. */
export const distance = (a: Rgb, b: Rgb): number => {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
};

/** Index of the palette colour closest to `c`. */
export const nearest = (palette: Rgb[], c: Rgb): number => {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distance(palette[i]!, c);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
};
