/**
 * Returns a Tailwind color class based on whether the gain is positive, negative, or zero.
 *
 * Driven by the absolute `gainValue`, NOT by a percentage. With a zero cost
 * basis (e.g. airdropped tokens, freebie holdings, fully-divested positions
 * with realized proceeds) percentage math collapses to 0% even when the user
 * actually made money, which previously left the figure stuck at neutral
 * grey despite a real gain. The sign of the dollar gain is the truth.
 */
export const getGainColorClass = ({ gainValue }: { gainValue: number }): string => {
  if (gainValue > 0) return 'text-app-income-color';
  if (gainValue < 0) return 'text-destructive-text';
  return 'text-muted-foreground';
};
