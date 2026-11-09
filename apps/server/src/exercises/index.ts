import type { MachineKind, Weight } from '@benchmaxxers/shared';
import type { Challenge } from './types.js';
import { makeRng } from './rng.js';
import { benchChallenge } from './bench.js';
import { treadmillChallenge } from './treadmill.js';
import { yogaChallenge } from './yoga.js';

export type { Challenge, Question, Step } from './types.js';

/** Makes a fresh set for a machine. The same seed always gives the same set. */
export const makeChallenge = (kind: MachineKind, weight: Weight, seed: number): Challenge => {
  const r = makeRng(seed);
  if (kind === 'bench') return benchChallenge(r, weight);
  if (kind === 'treadmill') return treadmillChallenge(r, weight);
  return yogaChallenge(r, weight);
};
