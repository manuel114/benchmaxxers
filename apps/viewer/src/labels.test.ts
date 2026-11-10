import { describe, expect, it } from 'vitest';
import { linePlaceLabel } from './labels.js';

describe('linePlaceLabel', () => {
  it.each([[1, 'next'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [21, '21st'], [22, '22nd']])('%i reads %s', (n, label) => {
    expect(linePlaceLabel(n)).toBe(label);
  });
});
