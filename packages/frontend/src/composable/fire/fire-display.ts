import { formatLargeNumber } from '@/js/helpers';
import { toLocalNumber } from '@/js/helpers/formatters';
import { useCurrenciesStore } from '@/stores';
import { storeToRefs } from 'pinia';

import type { FireChart } from './build-fire-plan';

const NOT_REACHED_CEILING_PCT = 99.9;
const COMPACT_SIGNIFICANT_DIGITS = 3;

// Rounds before the suffix is picked, so 999,600 reads "$1M" rather than "$1,000K".
export const formatFireCompact = ({ amount, currency }: { amount: number; currency?: string }) =>
  formatLargeNumber(Number(amount.toPrecision(COMPACT_SIGNIFICANT_DIGITS)), {
    isFiat: true,
    currency,
    thousandSuffix: 'K',
  });

export const useFormatFireCompact = () => {
  const { baseCurrency } = storeToRefs(useCurrenciesStore());
  return ({ amount }: { amount: number }) =>
    formatFireCompact({ amount, currency: baseCurrency.value?.currency?.code });
};

export const displayProgressPct = ({ ratio, reached }: { ratio: number; reached: boolean }): number => {
  const pct = Math.floor(Math.max(0, ratio) * 1000) / 10;
  return reached ? pct : Math.min(NOT_REACHED_CEILING_PCT, pct);
};

export const formatProgressPct = ({ ratio, reached }: { ratio: number; reached: boolean }): string =>
  `${toLocalNumber(displayProgressPct({ ratio, reached }), { maximumFractionDigits: 1, minimumFractionDigits: 0 })}%`;

export const milestoneLabel = ({ pct, targetName }: { pct: number; targetName: string }): string =>
  pct === 100 ? targetName : `${pct}%`;

const FIRE_PADDING_MONTHS = 24;
const UNREACHED_VIEW_MONTHS = 360;

export const shapeFireChart = ({ chart }: { chart: FireChart }) => {
  const lastMonth = Math.min(
    chart.projection.length - 1,
    chart.fireMonth === null ? UNREACHED_VIEW_MONTHS : chart.fireMonth + FIRE_PADDING_MONTHS,
  );
  const projection = chart.projection.slice(0, lastMonth + 1);
  const { rangeLow, rangeHigh } = chart;
  const band =
    rangeLow === null || rangeHigh === null
      ? []
      : projection.flatMap((point, month) => {
          const low = rangeLow[month];
          const high = rangeHigh[month];
          return low && high ? [{ date: point.date, low: low.value, high: high.value }] : [];
        });
  const dots = chart.milestoneMonths.filter(({ month }) => month > 0 && month <= lastMonth);
  const fireDot =
    chart.fireMonth !== null && chart.fireMonth > 0 && chart.fireMonth <= lastMonth
      ? projection[chart.fireMonth]!
      : null;
  return { history: chart.history, projection, band, dots, fireDot };
};
