export const getHoursInMilliseconds = (hours: number) => {
  if (Number.isNaN(hours)) return hours;
  if (!Number.isFinite(hours)) return hours;

  return hours * 60 * 60 * 1000;
};
