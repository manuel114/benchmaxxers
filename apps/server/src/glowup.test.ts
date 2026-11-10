import { describe, expect, it } from 'vitest';
import { buildForStrength, nextGlowUp, statFromPoints } from '@benchmaxxers/shared';

describe('nextGlowUp', () => {
  it('counts the strength points to the next body build, and is done at Maxxed', () => {
    const fresh = nextGlowUp(0)!;
    expect(fresh).toMatchObject({ from: 'Noodle', to: 'Toned', progress: 0 });
    // Exactly enough points reach the next build.
    expect(buildForStrength(statFromPoints(fresh.pointsToGo))).toBe(1);
    expect(buildForStrength(statFromPoints(fresh.pointsToGo - 1))).toBe(0);
    expect(nextGlowUp(fresh.pointsToGo)).toMatchObject({ from: 'Toned', to: 'Buff', progress: 0 });
    expect(nextGlowUp(100_000)).toBeNull();
  });
});
