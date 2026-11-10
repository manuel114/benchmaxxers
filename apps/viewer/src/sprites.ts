/**
 * Every image the page draws, by asset id. Reads assets/manifest.json: an
 * asset marked `present` loads from its PNG; anything else gets a code-drawn
 * placeholder of the same size. Character art is recoloured per agent.
 */
import { ASSETS, type AssetDef } from '@benchmaxxers/shared/assets';
import { recolor, type Appearance } from './appearance.js';
import { drawPlaceholder } from './placeholders.js';
import type { Pixels } from './pixels.js';

/** One manifest entry, as `pnpm assets:status` writes it. */
type ManifestEntry = { file: string; width: number; height: number; frames: number; fps: number; anchor: [number, number]; present: boolean };

/** A ready-to-draw frame strip. */
export type Sprite = {
  id: string;
  image: HTMLCanvasElement;
  width: number;
  height: number;
  frames: number;
  fps: number;
  anchor: [number, number];
  /** True when this is real art, false for a placeholder. */
  real: boolean;
};

/** Copies a pixel buffer onto a new canvas. */
const toCanvas = (px: Pixels): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = px.width;
  c.height = px.height;
  const img = new ImageData(px.width, px.height);
  img.data.set(px.data);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
};

/** Loads a PNG and copies it onto a canvas, or resolves null if it won't load. */
const loadImage = (url: string): Promise<HTMLCanvasElement | null> => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    resolve(c);
  };
  img.onerror = () => resolve(null);
  img.src = url;
});

/** All sprites, plus per-agent recoloured copies made on first use. */
export class SpriteBank {
  private readonly sprites = new Map<string, Sprite>();
  private readonly tinted = new Map<string, Sprite>();

  /** How many assets are real art rather than placeholders. */
  realCount = 0;

  private constructor() {}

  /** Loads the manifest and every image in it. */
  static async load(base = ''): Promise<SpriteBank> {
    const bank = new SpriteBank();
    let manifest: Record<string, ManifestEntry> = {};
    try {
      const res = await fetch(`${base}/manifest.json`);
      if (res.ok) manifest = ((await res.json()) as { assets: Record<string, ManifestEntry> }).assets;
    } catch { /* no manifest: everything is a placeholder */ }

    const defs = ASSETS.filter((a) => !a.file.startsWith('..'));
    await Promise.all(defs.map(async (def) => {
      const entry = manifest[def.id];
      const real = entry?.present ? await loadImage(`${base}/${def.file}`) : null;
      const ok = real && real.width === def.width * def.frames && real.height === def.height;
      if (real && !ok) console.warn(`[sprites] ${def.id} is ${real.width}x${real.height}, expected ${def.width * def.frames}x${def.height}; using a placeholder`);
      if (ok) bank.realCount++;
      bank.sprites.set(def.id, bank.make(def, ok ? real : toCanvas(drawPlaceholder(def)), Boolean(ok)));
    }));
    return bank;
  }

  /** Wraps a canvas as a sprite with the asset's numbers. */
  private make(def: AssetDef, image: HTMLCanvasElement, real: boolean): Sprite {
    return { id: def.id, image, width: def.width, height: def.height, frames: def.frames, fps: def.fps ?? 0, anchor: def.anchor, real };
  }

  /** Total number of game images. */
  get total(): number {
    return this.sprites.size;
  }

  /** A sprite by id. Throws for unknown ids so typos show up at once. */
  get(id: string): Sprite {
    const s = this.sprites.get(id);
    if (!s) throw new Error(`Unknown sprite ${id}`);
    return s;
  }

  /** A sprite recoloured with one agent's swap colours. */
  forAgent(id: string, look: Appearance): Sprite {
    const key = `${id}|${look.key}`;
    const hit = this.tinted.get(key);
    if (hit) return hit;
    const base = this.get(id);
    const c = document.createElement('canvas');
    c.width = base.image.width;
    c.height = base.image.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(base.image, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    recolor(img.data, look.swaps);
    ctx.putImageData(img, 0, 0);
    const out = { ...base, image: c };
    this.tinted.set(key, out);
    return out;
  }
}

/** The frame to show for a sprite at time `t` (ms), looping. */
export const frameAt = (s: Pick<Sprite, 'frames' | 'fps'>, t: number, offset = 0): number =>
  s.frames <= 1 || s.fps <= 0 ? 0 : Math.floor(((t + offset) / 1000) * s.fps) % s.frames;

/** Draws one frame of a sprite with its anchor on (x, y). `flip` mirrors it left-right around the anchor. */
export const drawSprite = (ctx: CanvasRenderingContext2D, s: Sprite, frame: number, x: number, y: number, flip = false): void => {
  const sx = frame * s.width;
  const dx = Math.round(x - (flip ? s.width - s.anchor[0] : s.anchor[0]));
  const dy = Math.round(y - s.anchor[1]);
  if (!flip) {
    ctx.drawImage(s.image, sx, 0, s.width, s.height, dx, dy, s.width, s.height);
    return;
  }
  ctx.save();
  ctx.translate(dx + s.width, dy);
  ctx.scale(-1, 1);
  ctx.drawImage(s.image, sx, 0, s.width, s.height, 0, 0, s.width, s.height);
  ctx.restore();
};
