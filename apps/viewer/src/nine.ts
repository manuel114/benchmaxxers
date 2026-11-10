/**
 * 9-slice drawing for the stretchable UI art (bubbles, name tag, progress
 * frame). Corners are drawn as they are, edges repeat along their length (so
 * the whisper bubble's dotted outline stays dotted), and the plain centre
 * stretches. Sizes are in art pixels; the drawing is scaled by the page zoom.
 */
import type { Sprite } from './sprites.js';

/** How far in from each side the corners reach, [x, y] in art pixels, from art/previews/batch-8/ui-checks.json. */
export const NINE_INSETS: Record<string, [number, number]> = {
  'ui.bubble': [8, 8],
  'ui.bubble_whisper': [8, 8],
  'ui.bubble_shout': [8, 8],
  'ui.name_tag': [4, 4],
  'ui.progress_frame': [8, 2],
};

/** One copy from the source image to the target, both in art pixels. */
export type Slice = { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number };

/** Splits a span into pieces of at most `step`, so an edge can repeat its pattern. */
const tiles = (length: number, step: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let at = 0; at < length; at += step) out.push([at, Math.min(step, length - at)]);
  return out;
};

/** The copies that draw a `srcW`×`srcH` 9-slice image at `w`×`h`. Sizes smaller than the two corners are grown to fit them. */
export const nineSlices = (srcW: number, srcH: number, [ix, iy]: [number, number], w: number, h: number): Slice[] => {
  const W = Math.max(w, 2 * ix + 1);
  const H = Math.max(h, 2 * iy + 1);
  const smw = srcW - 2 * ix; // source middle width
  const smh = srcH - 2 * iy;
  const mw = W - 2 * ix; // target middle width
  const mh = H - 2 * iy;
  const out: Slice[] = [];
  const cols: [number, number, number, number][] = [[0, 0, ix, ix], [ix, ix, smw, mw], [srcW - ix, W - ix, ix, ix]];
  const rows: [number, number, number, number][] = [[0, 0, iy, iy], [iy, iy, smh, mh], [srcH - iy, H - iy, iy, iy]];
  rows.forEach(([sy, dy, sh, dh], r) => cols.forEach(([sx, dx, sw, dw], c) => {
    const midX = c === 1;
    const midY = r === 1;
    if (midX && midY) { out.push({ sx, sy, sw, sh, dx, dy, dw, dh }); return; } // plain centre: stretch
    if (midX) { for (const [o, len] of tiles(dw, sw)) out.push({ sx, sy, sw: len, sh, dx: dx + o, dy, dw: len, dh }); return; }
    if (midY) { for (const [o, len] of tiles(dh, sh)) out.push({ sx, sy, sw, sh: len, dx, dy: dy + o, dw, dh: len }); return; }
    out.push({ sx, sy, sw, sh, dx, dy, dw, dh }); // corner
  }));
  return out;
};

/** Draws a 9-slice sprite with its top-left at screen (x, y), `w`×`h` art pixels big, at zoom `z`. */
export const drawNine = (ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, w: number, h: number, z: number): void => {
  const insets = NINE_INSETS[s.id];
  if (!insets) throw new Error(`${s.id} is not a 9-slice image`);
  const ox = Math.round(x);
  const oy = Math.round(y);
  for (const p of nineSlices(s.width, s.height, insets, w, h)) {
    ctx.drawImage(s.image, p.sx, p.sy, p.sw, p.sh, ox + p.dx * z, oy + p.dy * z, p.dw * z, p.dh * z);
  }
};
