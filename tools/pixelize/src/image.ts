import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';

/** A plain RGBA image in memory. */
export type Image = { width: number; height: number; data: Uint8Array };

/** Reads a PNG file into an RGBA image. */
export const readPng = (path: string): Image => {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
};

/** Writes an RGBA image to a PNG file, creating folders as needed. */
export const writePng = (path: string, img: Image): void => {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
};

/** Makes a blank, fully transparent image. */
export const blank = (width: number, height: number): Image => ({ width, height, data: new Uint8Array(width * height * 4) });

/** Index of a pixel's first byte. */
export const at = (img: Image, x: number, y: number): number => (y * img.width + x) * 4;
