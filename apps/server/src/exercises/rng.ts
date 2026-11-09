/** A small seeded random number generator, so a set can be rebuilt from its seed in tests. */
export type Rng = {
  /** A number from 0 up to (not including) 1. */
  next: () => number;
  /** A whole number from min to max, both included. */
  int: (min: number, max: number) => number;
  /** One item from a list. */
  pick: <T>(items: readonly T[]) => T;
  /** A shuffled copy of a list. */
  shuffle: <T>(items: readonly T[]) => T[];
};

/** Makes a generator from a seed (mulberry32). */
export const makeRng = (seed: number): Rng => {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const shuffle = <T,>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
  return { next, int, pick, shuffle };
};

/** Strips quotes and stray whitespace an agent might wrap an answer in. */
export const clean = (s: string): string => s.trim().replace(/^["'`“‘]+|["'`”’]+$/g, '').trim();

/** Lower-case, single-spaced, without a trailing full stop. */
export const loose = (s: string): string => clean(s).toLowerCase().replace(/\s+/g, ' ').replace(/[.!]+$/, '');

/** The first whole number in an answer, if any. */
export const firstNumber = (s: string): number | null => {
  const m = s.replace(/,/g, '').match(/-?\d+/);
  return m ? Number(m[0]) : null;
};
