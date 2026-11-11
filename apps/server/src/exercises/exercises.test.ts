import { describe, expect, it } from 'vitest';
import { MACHINE_KINDS } from '@benchmaxxers/shared';
import { makeChallenge } from './index.js';

const WEIGHTS = ['light', 'medium', 'heavy'] as const;

describe('exercises', () => {
  it('accepts every expected answer and rejects nonsense, across many seeds', () => {
    for (const kind of MACHINE_KINDS) {
      for (const weight of WEIGHTS) {
        for (let seed = 1; seed <= 60; seed++) {
          const c = makeChallenge(kind, weight, seed);
          for (const step of c.steps) {
            for (const q of step.questions) {
              expect(q.check(q.expected), `${kind}/${weight}/${seed}: ${q.ask} -> ${q.expected}`).toBe(true);
              expect(q.check('banana'), `${kind}/${weight}/${seed}: ${q.ask}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('is the same set for the same seed and different for another', () => {
    expect(makeChallenge('bench', 'light', 7).steps[0]!.prompt).toBe(makeChallenge('bench', 'light', 7).steps[0]!.prompt);
    expect(makeChallenge('bench', 'light', 7).steps[0]!.prompt).not.toBe(makeChallenge('bench', 'light', 8).steps[0]!.prompt);
  });

  it('hides each bench fact, plus its near-misses, in a log of the right length', () => {
    // Filler lines + 3 facts + 3 decoys per near-miss level (light 0, medium 1, heavy 2).
    for (const [weight, lines] of [['light', 43], ['medium', 306], ['heavy', 429]] as const) {
      const log = makeChallenge('bench', weight, 3).steps[0]!.prompt.split('QUESTIONS')[0]!;
      expect(log.trim().split('\n').length - 1).toBe(lines);
    }
  });

  it('only accepts one colour, not a list of guesses', () => {
    const q = makeChallenge('bench', 'light', 5).steps[0]!.questions[1]!;
    expect(q.check(`It was ${q.expected}.`)).toBe(true);
    expect(q.check(`${q.expected} or ${q.expected === 'red' ? 'blue' : 'red'}`)).toBe(false);
  });

  it('keeps every set small enough to arrive in one tool reply', () => {
    for (const kind of ['bench', 'treadmill', 'yoga_mat'] as const) {
      for (const weight of ['light', 'medium', 'heavy'] as const) {
        for (let seed = 1; seed <= 20; seed++) {
          const c = makeChallenge(kind, weight, seed);
          for (const s of c.steps) expect(s.prompt.length, `${kind} ${weight} ${seed}`).toBeLessThan(20_000);
        }
      }
    }
  });

  it('gives every bench question exactly one answering line, even when the person shows up elsewhere', () => {
    let personElsewhere = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const weight of ['medium', 'heavy'] as const) {
        const step = makeChallenge('bench', weight, seed).steps[0]!;
        const lines = step.prompt.split('QUESTIONS')[0]!.split('\n');
        const [q1, q2, q3] = step.questions;
        const [, p1, day] = q1!.ask.match(/did (.+) use on (\w+)\?/) ?? q1!.ask.match(/locker did (.+) use on (\w+)\?/)!;
        const [, item, p2, place] = q2!.ask.match(/colour was the (.+) that (.+) left by the (.+)\?/)!;
        const [, p3, tm] = q3!.ask.match(/did (.+) run on treadmill (\d)\?/)!;
        expect(lines.filter((l) => l.includes(` ${p1} used locker `) && l.endsWith(` on ${day}.`))).toHaveLength(1);
        expect(lines.filter((l) => l.includes(` ${p2} left a `) && l.endsWith(` ${item} by the ${place}.`))).toHaveLength(1);
        expect(lines.filter((l) => l.includes(` ${p3} ran `) && l.endsWith(` km on treadmill ${tm}.`))).toHaveLength(1);
        for (const q of step.questions) expect(q.check(q.expected)).toBe(true);
        if (lines.filter((l) => l.includes(` ${p1} `)).length > 1 + (weight === 'heavy' ? 2 : 1)) personElsewhere++;
      }
    }
    // The people in the questions often appear in ordinary lines too, so an unusual name gives nothing away.
    expect(personElsewhere).toBeGreaterThan(100);
  });

  it('puts unusual names in ordinary lines as well', () => {
    const rare = ['Priya', 'Tomasz', 'Ingrid', 'Matteo', 'Sunita', 'Bjorn', 'Leilani', 'Rafael', 'Oksana', 'Desmond', 'Mireille', 'Haruki', 'Zainab', 'Lorenzo', 'Annika', 'Kwame', 'Sofia', 'Dmitri', 'Esperanza', 'Callum'];
    const step = makeChallenge('bench', 'heavy', 11).steps[0]!;
    const asked = step.questions.map((q) => q.ask).join(' ');
    const log = step.prompt.split('QUESTIONS')[0]!;
    expect(rare.filter((n) => !asked.includes(n) && log.includes(` ${n} `)).length).toBeGreaterThan(5);
  });

  it('gives the treadmill intervals of tasks, each interval with a deadline', () => {
    const c = makeChallenge('treadmill', 'heavy', 1);
    expect(c.steps).toHaveLength(4);
    expect(c.steps.every((s) => s.questions.length === 5 && s.stepMs === 50_000)).toBe(true);
    expect(makeChallenge('treadmill', 'light', 1).steps.flatMap((s) => s.questions)).toHaveLength(8);
  });
});
