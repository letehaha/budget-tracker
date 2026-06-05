const MINUTES_PER_DAY = 24 * 60;

/**
 * Translate a desired cadence in minutes into a cron expression that produces
 * a uniformly-spaced schedule. Returns `null` when the cadence cannot be
 * expressed cleanly — callers should treat that as "use a default" rather than
 * a runtime error, because cron's step semantics fundamentally cannot express
 * intervals like "every 90 minutes" or "every 5 hours starting now" without
 * irregular gaps at the hour/day boundary.
 *
 * Accepted inputs:
 *
 *   - 1..59           → step-of-minutes inside one hour (e.g. 15 → fires at
 *                       :00, :15, :30, :45 of every hour)
 *   - 60              → top of every hour
 *   - 120, 180, ...   → step-of-hours when the value is a clean multiple of 60
 *                       and the resulting hours step is in 2..23
 *   - 1440            → once a day at 00:00
 *   - anything else   → `null`
 *
 * Note: for sub-hour values that don't evenly divide 60 (e.g. 7, 11, 13) the
 * resulting `* / N * * * *` schedule has an irregular gap at the hour boundary
 * (cron resets the step counter every hour). This is accepted as the lesser
 * evil — rejecting them would be surprising for the common 15/30 case — but
 * callers that need exact uniform spacing should validate against the divisors
 * of 60 separately.
 */
export const minutesToCronExpression = ({ minutes }: { minutes: number }): string | null => {
  if (!Number.isInteger(minutes) || minutes < 1) return null;
  if (minutes < 60) return `*/${minutes} * * * *`;
  if (minutes === MINUTES_PER_DAY) return '0 0 * * *';
  if (minutes % 60 !== 0) return null;
  const hours = minutes / 60;
  if (hours < 1 || hours > 23) return null;
  return `0 */${hours} * * *`;
};
