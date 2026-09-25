import type { ComposerTranslation } from 'vue-i18n';

type DurationKeys = { years: string; months: string; yearsMonths?: string };

const DEFAULT_KEYS: DurationKeys = {
  years: 'common.duration.years',
  months: 'common.duration.months',
};

export const formatDuration = ({
  months,
  t,
  keys = DEFAULT_KEYS,
}: {
  months: number;
  t: ComposerTranslation;
  keys?: DurationKeys;
}): string => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return t(keys.months, { n: m }, m);
  if (m === 0) return t(keys.years, { n: y }, y);
  if (keys.yearsMonths) return t(keys.yearsMonths, { y, m });
  return `${t(keys.years, { n: y }, y)} ${t(keys.months, { n: m }, m)}`;
};
