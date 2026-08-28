import { getCurrentLocale } from '@/i18n';
import { format, parseISO } from 'date-fns';
import { enUS, uk } from 'date-fns/locale';

const localeMap = { en: enUS, uk } as const;

/**
 * UTC calendar day of `date` as `yyyy-MM-dd` — exactly what SQL `DATE("time")`
 * yields in the backend's UTC database (mirror of the backend's `utcDayKey`).
 * Use it whenever a day classification must match the server's, never the
 * browser-local day.
 */
export function utcDayKey({ date }: { date: Date | string }): string {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * Format an ISO date string for compact UI display (e.g. "29 May 2026").
 * Falls back to the raw input if the value can't be parsed, so callers can
 * pass user-entered or partially-populated values without crashing.
 */
export function formatShortDate(iso: string): string {
  try {
    const parsed = parseISO(iso);
    if (Number.isNaN(parsed.getTime())) return iso;
    const localeKey = getCurrentLocale() as keyof typeof localeMap;
    return format(parsed, 'dd MMM yyyy', { locale: localeMap[localeKey] ?? enUS });
  } catch {
    return iso;
  }
}
