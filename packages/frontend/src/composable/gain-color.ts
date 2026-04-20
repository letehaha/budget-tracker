/**
 * Returns a Tailwind color class based on whether the gain is positive, negative, or zero.
 */
export const getGainColorClass = ({ gainPercent }: { gainPercent: number }): string => {
  if (gainPercent > 0) return 'text-app-income-color';
  if (gainPercent < 0) return 'text-destructive-text';
  return 'text-muted-foreground';
};
