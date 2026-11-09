import { type Image, blank, at } from './image.js';
import { type Rgb, nearest } from './palette.js';

/** An image where each pixel is a palette index, or -1 for see-through. */
export type Indexed = { width: number; height: number; idx: Int16Array };

/** A rectangle in source pixels. */
type Rect = { x: number; y: number; w: number; h: number };

/** A cleaned-up piece of art in art pixels. */
type Art = { w: number; h: number; idx: Int16Array };

/** True for the magenta generation background and its soft edges. */
const isMagenta = (r: number, g: number, b: number): boolean => r > 170 && b > 170 && g < 110 && Math.abs(r - b) < 90;

/** Snaps every pixel to the palette and drops the magenta background. */
export const toIndexed = (img: Image, palette: Rgb[], keyMagenta: boolean): Indexed => {
  const idx = new Int16Array(img.width * img.height);
  /** Cache so repeated source colours are only matched once. */
  const cache = new Map<number, number>();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = at(img, x, y);
      const r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!, a = img.data[i + 3]!;
      if (a < 128 || (keyMagenta && isMagenta(r, g, b))) { idx[y * img.width + x] = -1; continue; }
      const key = (r << 16) | (g << 8) | b;
      let p = cache.get(key);
      if (p === undefined) { p = nearest(palette, [r, g, b]); cache.set(key, p); }
      idx[y * img.width + x] = p;
    }
  }
  return { width: img.width, height: img.height, idx };
};

/** Guesses how many image pixels make one art pixel, from the lengths of same-colour runs. */
export const estimateScale = (ix: Indexed): number => {
  const runs: number[] = [];
  /** Records the runs along one line of pixels. */
  const scan = (get: (i: number) => number, len: number) => {
    let start = 0;
    for (let i = 1; i <= len; i++) {
      if (i === len || get(i) !== get(start)) {
        if (get(start) >= 0 && i - start >= 2) runs.push(i - start);
        start = i;
      }
    }
  };
  for (let y = 0; y < ix.height; y++) scan((x) => ix.idx[y * ix.width + x]!, ix.width);
  for (let x = 0; x < ix.width; x++) scan((y) => ix.idx[y * ix.width + x]!, ix.height);
  if (runs.length === 0) return 1;
  const total = runs.reduce((s, l) => s + l, 0);
  const scores: number[] = [];
  for (let k = 2; k <= 32; k++) {
    let s = 0;
    for (const l of runs) {
      const m = l % k;
      const err = Math.min(m, k - m);
      s += l * (1 - (2 * err) / k);
    }
    scores[k] = s / total;
  }
  const best = Math.max(...scores.filter((v) => v !== undefined));
  for (let k = 32; k >= 2; k--) if ((scores[k] ?? 0) >= best * 0.97) return k;
  return 1;
};

/** Smallest rectangle holding every visible pixel inside the given columns. */
const boundsIn = (ix: Indexed, x0: number, x1: number): Rect | null => {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < ix.height; y++) {
    for (let x = x0; x < x1; x++) {
      if (ix.idx[y * ix.width + x]! >= 0) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
};

/** Shrinks one rectangle of the source to art pixels, taking the most common colour of each block's centre. */
const downsample = (ix: Indexed, r: Rect, k: number, cells?: { w: number; h: number }): Art => {
  const w = cells?.w ?? Math.max(1, Math.round(r.w / k));
  const h = cells?.h ?? Math.max(1, Math.round(r.h / k));
  const cw = r.w / w, ch = r.h / h;
  const out = new Int16Array(w * h);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const sx0 = Math.floor(r.x + cx * cw + cw * 0.2), sx1 = Math.max(sx0 + 1, Math.ceil(r.x + cx * cw + cw * 0.8));
      const sy0 = Math.floor(r.y + cy * ch + ch * 0.2), sy1 = Math.max(sy0 + 1, Math.ceil(r.y + cy * ch + ch * 0.8));
      const counts = new Map<number, number>();
      let clear = 0, solid = 0;
      for (let y = sy0; y < Math.min(sy1, ix.height); y++) {
        for (let x = sx0; x < Math.min(sx1, ix.width); x++) {
          const v = ix.idx[y * ix.width + x]!;
          if (v < 0) clear++; else { solid++; counts.set(v, (counts.get(v) ?? 0) + 1); }
        }
      }
      let best = -1, bestN = 0;
      for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
      out[cy * w + cx] = clear > solid ? -1 : best;
    }
  }
  return { w, h, idx: out };
};

/** Splits the image into left-to-right pieces separated by empty columns. */
const columnSegments = (ix: Indexed, minGap: number): { start: number; end: number }[] => {
  const used: boolean[] = [];
  for (let x = 0; x < ix.width; x++) {
    let any = false;
    for (let y = 0; y < ix.height && !any; y++) any = ix.idx[y * ix.width + x]! >= 0;
    used.push(any);
  }
  const segs: { start: number; end: number }[] = [];
  let x = 0;
  while (x < ix.width) {
    if (!used[x]) { x++; continue; }
    const start = x;
    while (x < ix.width && used[x]) x++;
    segs.push({ start, end: x });
  }
  const merged: { start: number; end: number }[] = [];
  for (const s of segs) {
    const last = merged.at(-1);
    if (last && s.start - last.end < minGap) last.end = s.end; else merged.push({ ...s });
  }
  return merged;
};

/** Merges the closest pieces until there are exactly `frames` of them. */
const fitSegments = (segs: { start: number; end: number }[], frames: number): { start: number; end: number }[] => {
  const out = segs.map((s) => ({ ...s }));
  while (out.length > frames) {
    let bestI = 0, bestGap = Infinity;
    for (let i = 0; i < out.length - 1; i++) {
      const gap = out[i + 1]!.start - out[i]!.end;
      if (gap < bestGap) { bestGap = gap; bestI = i; }
    }
    out.splice(bestI, 2, { start: out[bestI]!.start, end: out[bestI + 1]!.end });
  }
  if (out.length < frames) {
    throw new Error(`Found ${out.length} separate frames but expected ${frames}. The frames probably touch: ask for more space between them.`);
  }
  return out;
};

/** Paints art onto an image at a position, in palette colours. */
const paint = (img: Image, art: Art, palette: Rgb[], ox: number, oy: number): void => {
  for (let y = 0; y < art.h; y++) {
    for (let x = 0; x < art.w; x++) {
      const v = art.idx[y * art.w + x]!;
      const tx = ox + x, ty = oy + y;
      if (v < 0 || tx < 0 || ty < 0 || tx >= img.width || ty >= img.height) continue;
      const c = palette[v]!;
      const i = at(img, tx, ty);
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
};

/** Result of a cleanup: the image plus anything worth a look. */
export type Result = { image: Image; scale: number; warnings: string[] };

/** Options for an animation strip. */
export type StripOptions = { frames: number; frameW: number; frameH: number; anchor: [number, number]; scale?: number };

/** Cleans a row of animation frames and lays them out in fixed-size cells, feet on the anchor row. */
export const cleanStrip = (img: Image, palette: Rgb[], o: StripOptions): Result => {
  const warnings: string[] = [];
  const ix = toIndexed(img, palette, true);
  const k = o.scale ?? estimateScale(ix);
  const segs = fitSegments(columnSegments(ix, Math.max(2, k)), o.frames);
  const rects = segs.map((s) => boundsIn(ix, s.start, s.end)!);
  const arts = rects.map((r) => downsample(ix, r, k));
  // Keep each frame's height relative to the others (so jumps stay jumps), feet of the lowest frame on the anchor.
  const baseline = Math.max(...rects.map((r) => r.y + r.h));
  const out = blank(o.frameW * o.frames, o.frameH);
  arts.forEach((art, i) => {
    const lift = Math.round((baseline - (rects[i]!.y + rects[i]!.h)) / k);
    const x = i * o.frameW + o.anchor[0] - Math.floor(art.w / 2);
    const y = o.anchor[1] - lift - art.h + 1;
    if (art.w > o.frameW || y < 0) {
      warnings.push(`Frame ${i + 1} is ${art.w}x${art.h} art pixels, too big for a ${o.frameW}x${o.frameH} cell. Check the scale (guessed ${k}) or redraw smaller.`);
    }
    paint(out, art, palette, Math.max(i * o.frameW, Math.min(x, (i + 1) * o.frameW - art.w)), y);
  });
  const heights = arts.map((a) => a.h);
  if (Math.max(...heights) - Math.min(...heights) > 3) warnings.push(`Frame heights vary a lot (${heights.join(', ')}). The head may change size between frames.`);
  return { image: out, scale: k, warnings };
};

/** Cleans one still image and places it bottom-centre on a canvas of the given size. */
export const cleanSprite = (img: Image, palette: Rgb[], o: { width: number; height: number; scale?: number }): Result => {
  const warnings: string[] = [];
  const ix = toIndexed(img, palette, true);
  const k = o.scale ?? estimateScale(ix);
  const r = boundsIn(ix, 0, ix.width);
  if (!r) throw new Error('The image is empty after removing the magenta background.');
  const art = downsample(ix, r, k);
  if (art.w > o.width || art.h > o.height) {
    warnings.push(`Art is ${art.w}x${art.h} art pixels, bigger than ${o.width}x${o.height}. Check the scale (guessed ${k}) or redraw smaller.`);
  }
  const out = blank(o.width, o.height);
  paint(out, art, palette, Math.floor((o.width - art.w) / 2), o.height - art.h);
  return { image: out, scale: k, warnings };
};

/** Cleans a tile that fills the whole image, shrinking it to exactly the given size. */
export const cleanTile = (img: Image, palette: Rgb[], o: { width: number; height: number; keyMagenta?: boolean }): Result => {
  const ix = toIndexed(img, palette, o.keyMagenta ?? false);
  const art = downsample(ix, { x: 0, y: 0, w: ix.width, h: ix.height }, 1, { w: o.width, h: o.height });
  const out = blank(o.width, o.height);
  paint(out, art, palette, 0, 0);
  return { image: out, scale: ix.width / o.width, warnings: [] };
};

/** Lists what is wrong with a finished asset. Empty means it passes. */
export const checkImage = (img: Image, palette: Rgb[], size?: { width: number; height: number }): string[] => {
  const problems: string[] = [];
  if (size && (img.width !== size.width || img.height !== size.height)) problems.push(`Size is ${img.width}x${img.height}, expected ${size.width}x${size.height}.`);
  const allowed = new Set(palette.map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));
  let half = 0, off = 0, magenta = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3]!;
    if (a === 0) continue;
    if (a !== 255) half++;
    const r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!;
    if (!allowed.has((r << 16) | (g << 8) | b)) off++;
    if (isMagenta(r, g, b)) magenta++;
  }
  if (half) problems.push(`${half} pixels are half see-through. Every pixel must be fully solid or fully clear.`);
  if (off) problems.push(`${off} pixels use colours outside the palette.`);
  if (magenta) problems.push(`${magenta} magenta pixels are left over from the background.`);
  return problems;
};
