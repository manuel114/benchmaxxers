/** Short words the gym page draws on the canvas. */

/** What an agent's place in a machine's line says: "next" for the front, then "2nd", "3rd", "4th". */
export const linePlaceLabel = (place: number): string => {
  if (place <= 1) return 'next';
  const tens = place % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[place % 10] ?? 'th';
  return `${place}${suffix}`;
};
