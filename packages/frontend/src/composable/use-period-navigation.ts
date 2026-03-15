import {
  addDays,
  addMonths,
  differenceInDays,
  endOfMonth,
  isFirstDayOfMonth,
  isLastDayOfMonth,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

export interface Period {
  from: Date;
  to: Date;
}

const getMonthCount = ({ period }: { period: Period }): number =>
  (period.to.getFullYear() - period.from.getFullYear()) * 12 + (period.to.getMonth() - period.from.getMonth()) + 1;

export const isFullMonthPeriod = ({ period }: { period: Period }): boolean =>
  isFirstDayOfMonth(period.from) && isLastDayOfMonth(period.to);

export const getPrevPeriod = ({ period }: { period: Period }): Period => {
  if (isFullMonthPeriod({ period })) {
    const monthCount = getMonthCount({ period });
    return {
      from: startOfMonth(subMonths(period.from, monthCount)),
      to: endOfMonth(subMonths(period.to, monthCount)),
    };
  }

  const durationDays = differenceInDays(period.to, period.from) + 1;
  return {
    from: subDays(period.from, durationDays),
    to: subDays(period.from, 1),
  };
};

export const getNextPeriod = ({ period }: { period: Period }): Period => {
  if (isFullMonthPeriod({ period })) {
    const monthCount = getMonthCount({ period });
    return {
      from: startOfMonth(addMonths(period.from, monthCount)),
      to: endOfMonth(addMonths(period.to, monthCount)),
    };
  }

  const durationDays = differenceInDays(period.to, period.from) + 1;
  return {
    from: addDays(period.to, 1),
    to: addDays(period.to, durationDays),
  };
};

export const usePeriodNavigation = ({ period }: { period: MaybeRefOrGetter<Period> }) => {
  const isFullMonth = computed(() => isFullMonthPeriod({ period: toValue(period) }));

  const durationDays = computed(() => {
    const p = toValue(period);
    return differenceInDays(p.to, p.from) + 1;
  });

  const prevPeriod = computed(() => getPrevPeriod({ period: toValue(period) }));
  const nextPeriod = computed(() => getNextPeriod({ period: toValue(period) }));

  return {
    isFullMonth,
    durationDays,
    prevPeriod,
    nextPeriod,
  };
};
