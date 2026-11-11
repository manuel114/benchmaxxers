import type { Weight } from '@benchmaxxers/shared';
import type { Challenge, Question } from './types.js';
import { type Rng, firstNumber, loose } from './rng.js';

/** Everyday gym-goers' names. */
const COMMON_NAMES = ['Ava', 'Ben', 'Chloe', 'Dev', 'Elif', 'Femi', 'Gus', 'Hana', 'Ivo', 'Jade', 'Kofi', 'Lena', 'Milo', 'Nia', 'Omar', 'Pia', 'Quinn', 'Rosa', 'Sami', 'Teo', 'Uma', 'Vik', 'Wren', 'Xan', 'Yara', 'Zed', 'Ari', 'Bea', 'Cal', 'Dina', 'Eli', 'Fay', 'Gil', 'Ida', 'Jon', 'Kai', 'Lou', 'Mae', 'Ned', 'Ola'];
/** Less common names. They show up in ordinary lines too, so the facts to find can't be spotted just by an unusual name. */
const RARE_NAMES = ['Priya', 'Tomasz', 'Ingrid', 'Matteo', 'Sunita', 'Bjorn', 'Leilani', 'Rafael', 'Oksana', 'Desmond', 'Mireille', 'Haruki', 'Zainab', 'Lorenzo', 'Annika', 'Kwame', 'Sofia', 'Dmitri', 'Esperanza', 'Callum'];
/** Everyone who can appear in a log, ordinary line or fact. */
const ALL_NAMES = [...COMMON_NAMES, ...RARE_NAMES];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const COLOURS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'black', 'white', 'grey'];
const ITEMS = ['towel', 'water bottle', 'hoodie', 'skipping rope', 'gym bag', 'protein shaker', 'notebook', 'pair of gloves'];
const PLACES = ['squat rack', 'front desk', 'water cooler', 'mirror', 'yoga mats', 'rowing machine', 'locker room door'];
const MACHINES = ['bench', 'treadmill', 'leg press', 'rowing machine', 'squat rack', 'cable machine'];
const TOPICS = ['the opening hours', 'a new locker key', 'the sauna', 'spin classes', 'the lost property box', 'protein bars'];

/**
 * Log length per weight. Kept under about 20,000 characters even at heavy, so
 * the whole set arrives in one tool reply: agent clients such as Claude Code
 * save bigger replies to a file instead of showing them.
 */
const LINES: Record<Weight, number> = { light: 40, medium: 300, heavy: 420 };

/** Near-miss lines per fact: same person, a different day, place or treadmill. Heavier sets get more. */
const DECOYS: Record<Weight, number> = { light: 0, medium: 1, heavy: 2 };

/** One ordinary log line, about anyone. */
const fillerLine = (r: Rng): string => {
  const n = r.pick(ALL_NAMES);
  switch (r.int(0, 6)) {
    case 0: return `${n} did ${r.int(2, 6)} sets on the ${r.pick(MACHINES)}.`;
    case 1: return `${n} used locker ${r.int(1, 60)} on ${r.pick(DAYS)}.`;
    case 2: return `${n} left a ${r.pick(COLOURS)} ${r.pick(ITEMS)} by the ${r.pick(PLACES)}.`;
    case 3: return `${n} ran ${r.int(2, 12)} km on treadmill ${r.int(1, 3)}.`;
    case 4: return `${n} refilled the water cooler.`;
    case 5: return `${n} asked the front desk about ${r.pick(TOPICS)}.`;
    default: return `The ${r.pick(MACHINES)} was wiped down by ${n}.`;
  }
};

/** Builds a bench press set: a long gym log with three facts hidden in it. */
export const benchChallenge = (r: Rng, weight: Weight): Challenge => {
  // The three people are drawn from everyone, so a fact looks like any other line.
  const [a, b, c] = r.shuffle(ALL_NAMES);
  const day = r.pick(DAYS), locker = r.int(1, 60);
  const colour = r.pick(COLOURS), item = r.pick(ITEMS), place = r.pick(PLACES);
  const km = r.int(2, 12), treadmill = r.int(1, 3);

  const facts = [
    `${a} used locker ${locker} on ${day}.`,
    `${b} left a ${colour} ${item} by the ${place}.`,
    `${c} ran ${km} km on treadmill ${treadmill}.`,
  ];
  // Decoys look like the answer but differ in the detail the question names, so each question still has one answer.
  const decoys: string[] = [];
  for (let i = 0; i < DECOYS[weight]; i++) {
    decoys.push(`${a} used locker ${r.int(1, 60)} on ${r.pick(DAYS.filter((d) => d !== day))}.`);
    decoys.push(`${b} left a ${r.pick(COLOURS.filter((c) => c !== colour))} ${item} by the ${r.pick(PLACES.filter((p) => p !== place))}.`);
    decoys.push(`${c} ran ${r.int(2, 12)} km on treadmill ${r.pick([1, 2, 3].filter((t) => t !== treadmill))}.`);
  }
  /** True when an ordinary line would also answer one of the questions, which would give it two answers. */
  const clashes = (line: string): boolean =>
    line.startsWith(`${a} used locker `) && line.endsWith(` on ${day}.`)
    || (line.startsWith(`${b} left a `) && line.endsWith(` ${item} by the ${place}.`))
    || (line.startsWith(`${c} ran `) && line.endsWith(` km on treadmill ${treadmill}.`));
  /** An ordinary line that answers no question. */
  const safeFiller = (): string => {
    for (;;) { const line = fillerLine(r); if (!clashes(line)) return line; }
  };
  const lines = Array.from({ length: LINES[weight] }, safeFiller);
  for (const line of [...facts, ...decoys]) lines.splice(r.int(0, lines.length), 0, line);
  let minute = 6 * 60;
  const log = lines.map((l) => {
    minute += r.int(0, 2);
    const hh = String(Math.floor(minute / 60) % 24).padStart(2, '0'), mm = String(minute % 60).padStart(2, '0');
    return `${hh}:${mm} ${l}`;
  }).join('\n');

  const questions: Question[] = [
    {
      ask: `Which locker did ${a} use on ${day}?`,
      expected: String(locker),
      check: (ans) => firstNumber(ans) === locker,
    },
    {
      ask: `What colour was the ${item} that ${b} left by the ${place}?`,
      expected: colour,
      // The right colour, and no other colour named (no guessing several).
      check: (ans) => {
        const words = loose(ans).split(/[^a-z]+/);
        const named = COLOURS.filter((col) => words.includes(col));
        return named.length === 1 && named[0] === colour;
      },
    },
    {
      ask: `How many km did ${c} run on treadmill ${treadmill}?`,
      expected: String(km),
      check: (ans) => firstNumber(ans) === km,
    },
  ];

  return {
    kind: 'bench',
    weight,
    timeLimitMs: 3 * 60_000,
    howToAnswer: 'Answer all 3 questions in one call, in order, one short answer each.',
    steps: [{ prompt: `GYM LOG\n${log}\n\nQUESTIONS\n${questions.map((q, i) => `${i + 1}. ${q.ask}`).join('\n')}`, questions }],
  };
};
