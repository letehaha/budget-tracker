import { getMonth, getYear } from 'date-fns';

export const HORIZON_MONTHS = 600;
const ZERO_RATE_EPSILON = 1e-9;
const MID_PERIOD = 0.5;

export const toRealAnnual = ({ nominalPct, inflationPct }: { nominalPct: number; inflationPct: number }): number =>
  (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1;

const toMonthly = ({ annual }: { annual: number }): number => Math.pow(1 + annual, 1 / 12) - 1;

export const fireNumber = ({
  annualSpending,
  withdrawalRatePct,
}: {
  annualSpending: number;
  withdrawalRatePct: number;
}): number => Math.max(0, annualSpending) / (withdrawalRatePct / 100);

export const typeTargets = ({
  annualSpending,
  withdrawalRatePct,
  leanMultiplier,
  fatMultiplier,
  baristaMonthlyIncome,
}: {
  annualSpending: number;
  withdrawalRatePct: number;
  leanMultiplier: number;
  fatMultiplier: number;
  baristaMonthlyIncome: number | null;
}) => {
  const regular = fireNumber({ annualSpending, withdrawalRatePct });
  return {
    regular,
    lean: regular * leanMultiplier,
    fat: regular * fatMultiplier,
    barista:
      baristaMonthlyIncome === null
        ? null
        : fireNumber({
            annualSpending: annualSpending - 12 * baristaMonthlyIncome,
            withdrawalRatePct,
          }),
  };
};

export const coastNumber = ({
  target,
  realAnnual,
  yearsToCoastAge,
}: {
  target: number;
  realAnnual: number;
  yearsToCoastAge: number;
}): number => (yearsToCoastAge <= 0 ? target : target / Math.pow(1 + realAnnual, yearsToCoastAge));

export const progressRatio = ({ balance, target }: { balance: number; target: number }): number =>
  target <= 0 ? (balance >= 0 ? 1 : 0) : Math.max(0, balance) / target;

export const monthlyIncomeFrom = ({
  balance,
  withdrawalRatePct,
}: {
  balance: number;
  withdrawalRatePct: number;
}): number => (Math.max(0, balance) * withdrawalRatePct) / 100 / 12;

export const yearsOfSpendingCovered = ({
  balance,
  annualSpending,
}: {
  balance: number;
  annualSpending: number;
}): number | null => (annualSpending <= 0 ? null : balance / annualSpending);

export const savingsRatePct = ({ income, expenses }: { income: number; expenses: number }): number | null =>
  income <= 0 ? null : ((income - expenses) / income) * 100;

export const requiredMonthlyContribution = ({
  balance,
  target,
  realAnnual,
  months,
}: {
  balance: number;
  target: number;
  realAnnual: number;
  months: number;
}): number => {
  if (months <= 0) return Math.max(0, target - balance);
  const i = toMonthly({ annual: realAnnual });
  if (Math.abs(i) < ZERO_RATE_EPSILON) return Math.max(0, (target - balance) / months);
  const growth = Math.pow(1 + i, months);
  return Math.max(0, ((target - balance * growth) * i) / (growth - 1));
};

export const ageAt = ({ birthYear, date }: { birthYear: number; date: Date }): number =>
  getYear(date) + (getMonth(date) + MID_PERIOD) / 12 - (birthYear + MID_PERIOD);

export const monthsToLabel = ({ months }: { months: number }) => ({
  years: Math.floor(months / 12),
  months: months % 12,
});

export const isReached = ({ balance, target }: { balance: number; target: number }): boolean =>
  target <= 0 ? balance >= 0 : balance >= target;

export const simulate = ({
  assets,
  liabilities,
  monthlyContribution,
  realAnnual,
  thresholds,
  coastMonths,
  coastThresholdIndex,
}: {
  assets: number;
  liabilities: number;
  monthlyContribution: number;
  realAnnual: number;
  thresholds: number[];
  coastMonths: number | null;
  coastThresholdIndex: number;
}) => {
  const i = toMonthly({ annual: realAnnual });
  const coastThreshold = thresholds[coastThresholdIndex]!;
  const series: number[] = [];
  const hitMonth: (number | null)[] = thresholds.map(() => null);
  let coastHitMonth: number | null = null;
  let b = assets;

  for (let m = 0; m <= HORIZON_MONTHS; m++) {
    if (m > 0) b = b * (1 + i) + monthlyContribution;
    const net = b - liabilities;
    series.push(net);

    thresholds.forEach((threshold, idx) => {
      if (hitMonth[idx] === null && b >= threshold) hitMonth[idx] = m;
    });
    if (
      coastMonths !== null &&
      coastHitMonth === null &&
      b * Math.pow(1 + i, Math.max(0, coastMonths - m)) >= coastThreshold
    ) {
      coastHitMonth = m;
    }
    if (b <= 0 && monthlyContribution <= 0) break;
  }

  return { series, hitMonth, coastHitMonth };
};
