import type { Weight } from '@benchmaxxers/shared';
import type { Challenge, Question, Step } from './types.js';
import { type Rng, clean, firstNumber, loose } from './rng.js';

/** Words for the letter tasks. */
const WORDS = ['barbell', 'dumbbell', 'treadmill', 'stretching', 'mississippi', 'kettlebell', 'protein', 'assessment', 'bookkeeper', 'successful', 'committee', 'balloon'];

/** Steps and seconds per step for each weight. */
const PACE: Record<Weight, { steps: number; seconds: number; big: number }> = {
  light: { steps: 8, seconds: 15, big: 50 },
  medium: { steps: 14, seconds: 12, big: 200 },
  heavy: { steps: 20, seconds: 10, big: 1000 },
};

/** Makes one tiny task. */
const task = (r: Rng, big: number): Question => {
  switch (r.int(0, 6)) {
    case 0: {
      const a = r.int(2, big), b = r.int(2, big);
      return { ask: `What is ${a} + ${b}?`, expected: String(a + b), check: (s) => firstNumber(s) === a + b };
    }
    case 1: {
      const a = r.int(2, 12), b = r.int(2, big > 50 ? 25 : 12);
      return { ask: `What is ${a} × ${b}?`, expected: String(a * b), check: (s) => firstNumber(s) === a * b };
    }
    case 2: {
      const w = r.pick(WORDS), rev = [...w].reverse().join('');
      return { ask: `Write '${w}' backwards.`, expected: rev, check: (s) => loose(s) === rev };
    }
    case 3: {
      const w = r.pick(WORDS), letter = r.pick([...new Set(w)]), n = [...w].filter((c) => c === letter).length;
      return { ask: `How many times does the letter '${letter}' appear in '${w}'?`, expected: String(n), check: (s) => firstNumber(s) === n };
    }
    case 4: {
      const nums = Array.from({ length: 5 }, () => r.int(1, big));
      const sorted = [...nums].sort((x, y) => x - y);
      return {
        ask: `Sort from smallest to largest, separated by commas: ${nums.join(', ')}`,
        expected: sorted.join(', '),
        check: (s) => (s.match(/-?\d+/g) ?? []).join(',') === sorted.join(','),
      };
    }
    case 5: {
      const start = r.int(1, 20), step = r.int(2, 9), seq = Array.from({ length: 4 }, (_, i) => start + i * step);
      const nextN = start + 4 * step;
      return { ask: `What comes next: ${seq.join(', ')}, ?`, expected: String(nextN), check: (s) => firstNumber(s) === nextN };
    }
    default: {
      const w = r.pick(WORDS);
      return { ask: `Write '${w}' in capital letters.`, expected: w.toUpperCase(), check: (s) => clean(s) === w.toUpperCase() };
    }
  }
};

/** Builds a treadmill set: many tiny tasks, one at a time, each against its own clock. */
export const treadmillChallenge = (r: Rng, weight: Weight): Challenge => {
  const pace = PACE[weight];
  const steps: Step[] = Array.from({ length: pace.steps }, (_, i) => {
    const q = task(r, pace.big);
    return { prompt: `Task ${i + 1} of ${pace.steps}: ${q.ask}`, questions: [q], stepMs: pace.seconds * 1000 };
  });
  return {
    kind: 'treadmill',
    weight,
    timeLimitMs: 4 * 60_000,
    howToAnswer: `Answer each task on its own, within ${pace.seconds} seconds. A late answer counts as wrong. Keep it short.`,
    steps,
  };
};
