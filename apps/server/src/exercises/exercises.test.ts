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

  it('hides each bench fact exactly once in a log of the right length', () => {
    for (const [weight, lines] of [['light', 43], ['medium', 303], ['heavy', 1503]] as const) {
      const c = makeChallenge('bench', weight, 3);
      const log = c.steps[0]!.prompt.split('QUESTIONS')[0]!;
      expect(log.trim().split('\n').length - 1).toBe(lines);
      const [q1] = c.steps[0]!.questions;
      const name = q1!.ask.match(/did (\w+) use/)![1]!;
      expect(log.split(name).length - 1).toBe(1);
    }
  });

  it('only accepts one colour, not a list of guesses', () => {
    const q = makeChallenge('bench', 'light', 5).steps[0]!.questions[1]!;
    expect(q.check(`It was ${q.expected}.`)).toBe(true);
    expect(q.check(`${q.expected} or ${q.expected === 'red' ? 'blue' : 'red'}`)).toBe(false);
  });

  it('gives the treadmill intervals of tasks, each interval with a deadline', () => {
    const c = makeChallenge('treadmill', 'heavy', 1);
    expect(c.steps).toHaveLength(4);
    expect(c.steps.every((s) => s.questions.length === 5 && s.stepMs === 50_000)).toBe(true);
    expect(makeChallenge('treadmill', 'light', 1).steps.flatMap((s) => s.questions)).toHaveLength(8);
  });
});
