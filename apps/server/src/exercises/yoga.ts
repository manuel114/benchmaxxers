import type { Weight } from '@benchmaxxers/shared';
import type { Challenge, Question } from './types.js';
import { type Rng, clean, firstNumber } from './rng.js';

/** Plain words used to build example answers that follow a rule. */
const WORD_BANK = ['run', 'lift', 'squat', 'curl', 'jump', 'walk', 'swim', 'row', 'bench', 'push', 'pull', 'calm', 'body', 'warm', 'cool', 'stand', 'today', 'strong', 'good', 'gym', 'mat', 'flow', 'hold', 'sit', 'up', 'arm', 'hand', 'back', 'long', 'fun', 'big', 'tiny', 'slow', 'fast', 'blue', 'pink', 'soft', 'hard'];
/** Words that start with each letter, for the "each word starts with" rule. */
const BY_LETTER: Record<string, string[]> = {
  b: ['big', 'blue', 'bench', 'body', 'back', 'bold', 'bright', 'brave'],
  s: ['slow', 'soft', 'squat', 'swim', 'stand', 'strong', 'small', 'sunny'],
  p: ['push', 'pull', 'pink', 'plank', 'proud', 'power', 'pace', 'pose'],
  t: ['tiny', 'today', 'tall', 'tough', 'twist', 'tempo', 'tight', 'toned'],
};
const LIST_ITEMS = ['kettlebell', 'barbell', 'treadmill', 'mat', 'rower', 'dumbbell', 'towel', 'bench', 'locker', 'mirror', 'whistle', 'bottle'];
const SPELL_WORDS = ['stretch', 'balance', 'breathe', 'posture', 'plank', 'warrior', 'cobra', 'lotus'];
const VOWEL_WORDS = ['flexibility', 'meditation', 'equilibrium', 'yoga', 'downward', 'relaxation', 'abdominal', 'endurance'];

/** Splits an answer into words, ignoring punctuation. */
const wordsOf = (s: string): string[] => clean(s).split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, '')).filter(Boolean);

/** "Exactly N words, none containing the letter X." */
const noLetter = (r: Rng, n: number): Question => {
  const letter = r.pick(['e', 'a', 'o', 'i']);
  const pool = WORD_BANK.filter((w) => !w.includes(letter));
  const expected = Array.from({ length: n }, () => r.pick(pool)).join(' ');
  return {
    ask: `Reply with exactly ${n} words, and none of the words may contain the letter '${letter}'.`,
    expected,
    check: (s) => { const w = wordsOf(s); return w.length === n && w.every((x) => !x.toLowerCase().includes(letter)); },
  };
};

/** "Write W backwards in capital letters." */
const backwardsCaps = (r: Rng): Question => {
  const w = r.pick(SPELL_WORDS), expected = [...w].reverse().join('').toUpperCase();
  return { ask: `Write the word '${w}' backwards in capital letters, and nothing else.`, expected, check: (s) => clean(s) === expected };
};

/** "Put these in alphabetical order, separated by ' | '." */
const alphabetical = (r: Rng, n: number): Question => {
  const items = r.shuffle(LIST_ITEMS).slice(0, n);
  const expected = [...items].sort().join(' | ');
  return { ask: `Put these in alphabetical order, separated by ' | ' and nothing else: ${items.join(', ')}`, expected, check: (s) => clean(s) === expected };
};

/** "A sentence of exactly N characters." */
const exactLength = (r: Rng): Question => {
  const n = r.int(30, 48);
  let expected = 'I hold the pose';
  while (expected.length < n - 1) expected += ` ${r.pick(WORD_BANK)}`;
  expected = `${expected.slice(0, n - 1)}.`;
  return { ask: `Write one sentence that is exactly ${n} characters long, counting spaces and punctuation.`, expected, check: (s) => s.trim().length === n };
};

/** "Exactly N words that each start with L." */
const startsWith = (r: Rng, n: number): Question => {
  const letter = r.pick(Object.keys(BY_LETTER));
  const expected = r.shuffle(BY_LETTER[letter]!).slice(0, n).join(' ');
  return {
    ask: `Write exactly ${n} words that each start with the letter '${letter}'.`,
    expected,
    check: (s) => { const w = wordsOf(s); return w.length === n && w.every((x) => x.toLowerCase().startsWith(letter)); },
  };
};

/** "Only a number: how many vowels in W?" */
const vowels = (r: Rng): Question => {
  const w = r.pick(VOWEL_WORDS), n = [...w].filter((c) => 'aeiou'.includes(c)).length;
  return { ask: `Reply with only a number: how many vowels (a, e, i, o, u) are in '${w}'?`, expected: String(n), check: (s) => /^\d+$/.test(clean(s)) && firstNumber(s) === n };
};

/** "Numbers 1 to N separated by single dashes." */
const dashes = (r: Rng): Question => {
  const n = r.int(5, 12), expected = Array.from({ length: n }, (_, i) => i + 1).join('-');
  return { ask: `Reply with the numbers 1 to ${n} separated by single dashes, like 1-2-3, and nothing else.`, expected, check: (s) => clean(s) === expected };
};

/** Builds a yoga set: answers that must follow strict rules. */
export const yogaChallenge = (r: Rng, weight: Weight): Challenge => {
  const easy = [() => backwardsCaps(r), () => alphabetical(r, 4), () => vowels(r), () => dashes(r)];
  const medium = [...easy, () => noLetter(r, r.int(5, 7)), () => startsWith(r, r.int(4, 5))];
  const hard = [() => noLetter(r, r.int(8, 10)), () => startsWith(r, 6), () => exactLength(r), () => alphabetical(r, 7), () => backwardsCaps(r), () => vowels(r)];
  const pool = weight === 'light' ? easy : weight === 'medium' ? medium : hard;
  const count = weight === 'light' ? 3 : weight === 'medium' ? 4 : 5;
  const questions = r.shuffle(pool).slice(0, count).map((make) => make());
  return {
    kind: 'yoga_mat',
    weight,
    timeLimitMs: 3 * 60_000,
    howToAnswer: `Answer all ${count} in one call, in order. Each answer is checked exactly against its rule, so give only what is asked.`,
    steps: [{ prompt: questions.map((q, i) => `${i + 1}. ${q.ask}`).join('\n'), questions }],
  };
};
