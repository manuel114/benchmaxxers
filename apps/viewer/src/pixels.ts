/**
 * A tiny RGBA pixel buffer the placeholder art is painted into. It has no DOM
 * dependency, so tests can check placeholders against the style rules.
 */
import characterPalette from '../../../art/palettes/character.json';
import environmentPalette from '../../../art/palettes/environment.json';

/** Palette colour names to hex, for both palettes. */
export type PaletteName = 'character' | 'environment';

/** Builds a name → hex lookup from a palette file. */
const lookup = (p: { colors: { hex: string; name: string }[] }): Record<string, string> =>
  Object.fromEntries(p.colors.map((c) => [c.name, c.hex.toUpperCase()]));

/** Character palette colours by name (`ink`, `skin-2`, `top-1`, …). */
export const CHAR = lookup(characterPalette);
/** Environment palette colours by name (`wood-2`, `rubber-1`, …). */
export const ENV = lookup(environmentPalette);

/** Every allowed hex in each palette, for checks. */
export const PALETTE_HEXES: Record<PaletteName, Set<string>> = {
  character: new Set(Object.values(CHAR)),
  environment: new Set(Object.values(ENV)),
};

/** Parses `#RRGGBB` into a packed 0xRRGGBB number. */
export const hexToInt = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/** Formats a packed 0xRRGGBB number as `#RRGGBB`. */
export const intToHex = (n: number): string => `#${n.toString(16).padStart(6, '0').toUpperCase()}`;

/** A width × height RGBA image where every pixel is fully solid or fully clear. */
export class Pixels {
  readonly data: Uint8ClampedArray;

  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /** True when (x, y) is inside the image. */
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Sets one pixel to a hex colour. Out-of-bounds writes are ignored. */
  set(x: number, y: number, hex: string): void {
    if (!this.inside(x, y)) return;
    const n = hexToInt(hex);
    const i = (y * this.width + x) * 4;
    this.data[i] = (n >> 16) & 255;
    this.data[i + 1] = (n >> 8) & 255;
    this.data[i + 2] = n & 255;
    this.data[i + 3] = 255;
  }

  /** Clears one pixel. */
  clear(x: number, y: number): void {
    if (!this.inside(x, y)) return;
    this.data[(y * this.width + x) * 4 + 3] = 0;
  }

  /** The pixel's hex colour, or null when it's clear. */
  get(x: number, y: number): string | null {
    if (!this.inside(x, y)) return null;
    const i = (y * this.width + x) * 4;
    if (this.data[i + 3] === 0) return null;
    return intToHex((this.data[i]! << 16) | (this.data[i + 1]! << 8) | this.data[i + 2]!);
  }

  /** Fills a rectangle. */
  rect(x: number, y: number, w: number, h: number, hex: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, hex);
  }

  /** Fills a rectangle with a 3-tone material: light top-left edge, dark bottom-right edge. */
  block(x: number, y: number, w: number, h: number, [dark, base, light]: [string, string, string]): void {
    this.rect(x, y, w, h, base);
    this.rect(x, y, w, 1, light);
    this.rect(x, y, 1, h, light);
    this.rect(x, y + h - 1, w, 1, dark);
    this.rect(x + w - 1, y, 1, h, dark);
  }

  /** Fills an axis-aligned ellipse inside the given box. */
  ellipse(x: number, y: number, w: number, h: number, hex: string): void {
    const cx = x + w / 2 - 0.5;
    const cy = y + h / 2 - 0.5;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const dx = (xx - cx) / (w / 2);
        const dy = (yy - cy) / (h / 2);
        if (dx * dx + dy * dy <= 1) this.set(xx, yy, hex);
      }
    }
  }

  /** Draws a 1-pixel outline in `hex` around every solid shape (on the clear pixels touching it). */
  outline(hex: string): void {
    const edge: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) !== null) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) edge.push([x, y]);
      }
    }
    for (const [x, y] of edge) this.set(x, y, hex);
  }

  /** Copies another buffer onto this one at (dx, dy), skipping clear pixels. */
  paste(src: Pixels, dx: number, dy: number, flipX = false): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const c = src.get(flipX ? src.width - 1 - x : x, y);
        if (c) this.set(dx + x, dy + y, c);
      }
    }
  }

  /** A copy turned a quarter turn anticlockwise (the top ends up on the left). */
  rotateLeft(): Pixels {
    const out = new Pixels(this.height, this.width);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, y);
        if (c) out.set(y, this.width - 1 - x, c);
      }
    }
    return out;
  }

  /** The lowest row with any solid pixel, or -1 for an empty image. */
  bottomRow(): number {
    for (let y = this.height - 1; y >= 0; y--) for (let x = 0; x < this.width; x++) if (this.get(x, y)) return y;
    return -1;
  }
}
