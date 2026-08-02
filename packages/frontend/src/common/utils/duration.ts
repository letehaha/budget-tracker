const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * 60;
const MINUTES_PER_HOUR = 60;

type CoarseDurationUnit = 'seconds' | 'minutes' | 'hours';

interface CoarseDuration {
  unit: CoarseDurationUnit;
  value: number;
}

const pad = ({ value }: { value: number }): string => String(value).padStart(2, '0');

/**
 * Renders a remaining duration as a clock countdown: `m:ss`, widening to
 * `h:mm:ss` past an hour. Seconds are floored so the display only reaches
 * `0:00` when the time is genuinely gone. Negative input reads as `0:00`.
 */
export function formatCountdown({ ms }: { ms: number }): string {
  const totalSeconds = Math.max(0, Math.floor(ms / MS_PER_SECOND));

  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  if (hours > 0) return `${hours}:${pad({ value: minutes })}:${pad({ value: seconds })}`;
  return `${minutes}:${pad({ value: seconds })}`;
}

/**
 * Reduces a duration to a single rounded unit for prose ("15 minutes"). Returns
 * the unit and count separately so the sentence is composed through i18n, which
 * is the only way plural forms survive translation.
 */
export function getCoarseDuration({ ms }: { ms: number }): CoarseDuration {
  const totalSeconds = Math.max(0, Math.round(ms / MS_PER_SECOND));
  if (totalSeconds < SECONDS_PER_MINUTE) return { unit: 'seconds', value: totalSeconds };

  const totalMinutes = Math.round(totalSeconds / SECONDS_PER_MINUTE);
  if (totalMinutes < MINUTES_PER_HOUR) return { unit: 'minutes', value: totalMinutes };

  return { unit: 'hours', value: Math.round(totalMinutes / MINUTES_PER_HOUR) };
}
