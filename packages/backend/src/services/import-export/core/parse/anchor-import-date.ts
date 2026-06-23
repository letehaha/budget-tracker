import { type ParsedImportDate } from './date-engine';

interface AnchorImportDateParams {
  parsed: ParsedImportDate;
  /** IANA timezone of the importing user's browser (e.g. `America/Montevideo`). */
  timezone: string | undefined;
}

/**
 * Resolves the engine's timezone-agnostic parse result into the absolute moment
 * stored on the transaction.
 *
 * The engine deliberately applies no timezone, so the calendar-day decision is
 * made here against the importing user's `timezone`:
 *
 * - `instant` already carries an absolute moment (the cell had an explicit zone)
 *   and is returned unchanged.
 * - `dateOnly` is anchored to **local noon** in `timezone`. Noon (not midnight)
 *   guarantees the stored instant renders as the same calendar day for that user
 *   and for any viewer within ±11h of them, and can't slip across a DST edge.
 * - `localDateTime` interprets its wall-clock components as a local time in
 *   `timezone`.
 *
 * Anchoring uses the runtime's IANA timezone database via `Intl.DateTimeFormat`,
 * so no timezone library dependency is required. If `timezone` is missing or not
 * a valid IANA zone, it falls back to UTC: UTC noon for `dateOnly` (which still
 * lands on the right day for every zone within ±11h) and UTC wall-clock for
 * `localDateTime`, rather than throwing.
 */
export function anchorImportDate({ parsed, timezone }: AnchorImportDateParams): Date {
  if (parsed.kind === 'instant') {
    return parsed.instant;
  }

  if (parsed.kind === 'dateOnly') {
    return zonedWallClockToInstant({
      wall: { year: parsed.year, month: parsed.month, day: parsed.day, hour: 12, minute: 0, second: 0, ms: 0 },
      timezone,
    });
  }

  return zonedWallClockToInstant({
    wall: {
      year: parsed.year,
      month: parsed.month,
      day: parsed.day,
      hour: parsed.hour,
      minute: parsed.minute,
      second: parsed.second,
      ms: parsed.ms,
    },
    timezone,
  });
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

/**
 * Converts wall-clock components, read as a local time in `timezone`, to the
 * absolute UTC instant. Falls back to interpreting them as UTC when `timezone`
 * is absent or invalid.
 */
function zonedWallClockToInstant({ wall, timezone }: { wall: WallClock; timezone: string | undefined }): Date {
  const utcGuessMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second, wall.ms);

  if (!timezone) {
    return new Date(utcGuessMs);
  }

  let offsetMs: number;
  try {
    // The offset is sampled at the guessed instant, then re-sampled at the
    // corrected instant. The second pass settles offsets that shift around a
    // DST boundary, where the first guess can land in the wrong side of the gap.
    const firstOffset = timezoneOffsetMs({ instantMs: utcGuessMs, timezone });
    offsetMs = timezoneOffsetMs({ instantMs: utcGuessMs - firstOffset, timezone });
  } catch {
    // Unknown IANA zone — treat the wall-clock components as UTC instead of
    // crashing the whole import.
    return new Date(utcGuessMs);
  }

  return new Date(utcGuessMs - offsetMs);
}

/**
 * The offset (in ms) of `timezone` from UTC at the given instant — positive east
 * of UTC. Computed by formatting the instant in the zone and diffing the
 * resulting wall-clock against the same instant read as UTC. Throws if
 * `timezone` is not a valid IANA zone.
 */
function timezoneOffsetMs({ instantMs, timezone }: { instantMs: number; timezone: string }): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(instantMs));
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  // Some runtimes emit "24" for midnight; normalise it to "00" so Date.UTC
  // doesn't roll the day forward.
  const hour = lookup.hour === '24' ? 0 : Number(lookup.hour);
  const wallAsUtcMs = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    hour,
    Number(lookup.minute),
    Number(lookup.second),
  );

  // `instantMs` may carry sub-second precision the formatter drops; align both
  // sides to whole seconds so the offset is a clean zone offset, not noise.
  const instantWholeSecondMs = Math.floor(instantMs / 1000) * 1000;
  return wallAsUtcMs - instantWholeSecondMs;
}
