import { readPng, writePng } from './image.js';
import { loadPalette } from './palette.js';
import { cleanStrip, cleanSprite, cleanTile, checkImage, type Result } from './pixelize.js';
import { resolve } from 'node:path';
import { REPO_ROOT } from './palette.js';

/** How to use the tool, printed on bad input. */
const USAGE = `Usage:
  pnpm pixelize strip  <raw.png> --frames N --frame WxH --palette NAME --out FILE [--anchor X,Y] [--scale K]
  pnpm pixelize sprite <raw.png> --size WxH --palette NAME --out FILE [--scale K]
  pnpm pixelize tile   <raw.png> --size WxH --palette NAME --out FILE [--key]
  pnpm pixelize check  <file.png> --palette NAME [--size WxH]`;

/** Reads `--name value` flags into a map. */
const parseFlags = (args: string[]): Map<string, string> => {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith('--')) continue;
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) flags.set(a.slice(2), 'true');
    else { flags.set(a.slice(2), next); i++; }
  }
  return flags;
};

/** Parses `32x48` into numbers. */
const parseSize = (s: string | undefined, what: string): { width: number; height: number } => {
  const m = s?.match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`--${what} must look like 32x48`);
  return { width: Number(m[1]), height: Number(m[2]) };
};

/** Paths are relative to where pnpm was run, which is the repo root for root scripts. */
const fromRoot = (p: string): string => resolve(process.env.INIT_CWD ?? REPO_ROOT, p);

/** Runs one command. */
const main = (): void => {
  const [cmd, input, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  if (!cmd || !input) throw new Error(USAGE);
  const palette = loadPalette(flags.get('palette') ?? 'environment');
  const img = readPng(fromRoot(input));
  const scale = flags.has('scale') ? Number(flags.get('scale')) : undefined;

  if (cmd === 'check') {
    const size = flags.has('size') ? parseSize(flags.get('size'), 'size') : undefined;
    const problems = checkImage(img, palette, size);
    if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exitCode = 1; }
    else console.log('✓ Looks good.');
    return;
  }

  let result: Result;
  if (cmd === 'strip') {
    const frame = parseSize(flags.get('frame'), 'frame');
    const frames = Number(flags.get('frames'));
    if (!frames) throw new Error('--frames is required');
    const anchorFlag = flags.get('anchor')?.split(',').map(Number);
    const anchor: [number, number] = anchorFlag && anchorFlag.length === 2
      ? [anchorFlag[0]!, anchorFlag[1]!]
      : frame.height === 24 ? [8, 22] : [Math.floor(frame.width / 2), frame.height - 2];
    result = cleanStrip(img, palette, { frames, frameW: frame.width, frameH: frame.height, anchor, scale });
  } else if (cmd === 'sprite') {
    result = cleanSprite(img, palette, { ...parseSize(flags.get('size'), 'size'), scale });
  } else if (cmd === 'tile') {
    result = cleanTile(img, palette, { ...parseSize(flags.get('size'), 'size'), keyMagenta: flags.has('key') });
  } else {
    throw new Error(USAGE);
  }

  const out = flags.get('out');
  if (!out) throw new Error('--out is required');
  writePng(fromRoot(out), result.image);
  console.log(`Wrote ${out} (${result.image.width}x${result.image.height}, guessed scale ${result.scale}).`);
  for (const w of result.warnings) console.warn(`! ${w}`);
  const problems = checkImage(result.image, palette);
  for (const p of problems) console.warn(`✗ ${p}`);
};

try {
  main();
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
}
