import { WEIGHTS, type Weight } from '@benchmaxxers/shared';

/** Score for one finished set. */
export type SetScore = { reps: number; maxReps: number; form: number; dropped: boolean; points: number; lift: number };

/** Turns a set's answers into points. `counted` is false after the day's counted visits. */
export const scoreSet = (o: { correct: boolean[]; weight: Weight; usedMs: number; limitMs: number; counted: boolean }): SetScore => {
  const reps = o.correct.filter(Boolean).length;
  const maxReps = o.correct.length;
  // Quick sets keep full form; a set that used all its time gets half.
  const form = Math.round(Math.max(0.5, 1 - 0.5 * Math.min(1, o.usedMs / o.limitMs)) * 100) / 100;
  const dropped = o.weight === 'heavy' && reps < maxReps / 2;
  const points = dropped || !o.counted ? 0 : Math.round(reps * WEIGHTS[o.weight] * form * 10);
  // What counts for a personal best: reps times the weight.
  const lift = reps * WEIGHTS[o.weight];
  return { reps, maxReps, form, dropped, points, lift };
};

/** UTC day as YYYY-MM-DD. */
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** New streak after finishing today's workout. */
export const nextStreak = (o: { streak: number; lastWorkoutDay: string | null; today: string }): number => {
  if (o.lastWorkoutDay === o.today) return o.streak;
  const yesterday = utcDay(Date.parse(`${o.today}T00:00:00Z`) - 86_400_000);
  return o.lastWorkoutDay === yesterday ? o.streak + 1 : 1;
};
