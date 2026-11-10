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
    for (const [weight, lines, mentions] of [['light', 43, 1], ['medium', 306, 2], ['heavy', 429, 3]] as const) {
      const c = makeChallenge('bench', weight, 3);
      const log = c.steps[0]!.prompt.split('QUESTIONS')[0]!;
      expect(log.trim().split('\n').length - 1).toBe(lines);
      const [q1] = c.steps[0]!.questions;
      const name = q1!.ask.match(/did (\w+) use/)![1]!;
      expect(log.split(name).length - 1).toBe(mentions);
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

  it('hides near-miss decoys in heavy bench logs without making any question ambiguous', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = makeChallenge('bench', 'heavy', seed);
      const [q1] = c.steps[0]!.questions;
      const person = q1!.ask.match(/did (\S+) use/)![1]!;
      const lockerLines = c.steps[0]!.prompt.split('\n').filter((l) => l.includes(`${person} used locker`));
      expect(lockerLines.length).toBe(3); // the fact plus two decoys on other days
      for (const q of c.steps[0]!.questions) expect(q.check(q.expected)).toBe(true);
    }
  });

  it('gives the treadmill intervals of tasks, each interval with a deadline', () => {
    const c = makeChallenge('treadmill', 'heavy', 1);
    expect(c.steps).toHaveLength(4);
    expect(c.steps.every((s) => s.questions.length === 5 && s.stepMs === 50_000)).toBe(true);
    expect(makeChallenge('treadmill', 'light', 1).steps.flatMap((s) => s.questions)).toHaveLength(8);
  });
});
