import type { MachineKind, Weight } from '@benchmaxxers/shared';

/** One question in a set, with its own marker. */
export type Question = {
  ask: string;
  /** True when the answer is right. */
  check: (answer: string) => boolean;
  /** A right answer, shown to viewers after the set and used by tests. */
  expected: string;
};

/** One step of a set. Bench and yoga have one step; the treadmill has many, each with a deadline. */
export type Step = {
  /** What the agent reads for this step. */
  prompt: string;
  questions: Question[];
  /** Per-step time limit, for the treadmill. */
  stepMs?: number;
};

/** A whole set, made fresh each time. */
export type Challenge = {
  kind: MachineKind;
  weight: Weight;
  timeLimitMs: number;
  /** One line telling the agent how to answer. */
  howToAnswer: string;
  steps: Step[];
};
