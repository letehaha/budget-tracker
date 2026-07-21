const MONTHS_PER_YEAR = 12;
/** Held strictly below 100%: at a full share the needed portfolio value is infinite. */
const MAX_TARGET_FRACTION = 0.99;

export interface FireTargetInput {
  /** Holdings value now, in base currency. */
  currentPortfolioValue: number;
  /** Expected monthly saving going forward, in base currency. */
  monthlySavings: number;
  /** Expected annual return, as a percentage (e.g. 10 for 10%). */
  annualReturnRatePct: number;
  /** Target share of a month's net-worth gain that growth should cover, as a percentage. */
  targetGrowthSharePct: number;
}

interface FireTargetBase {
  /**
   * Share of this month's net-worth gain that growth covers at the current
   * portfolio value, as a percentage — the yardstick the target is measured
   * against. 100 once saving stops contributing (or drags), 0 when the portfolio
   * cannot grow.
   */
  currentGrowthSharePct: number;
}

/**
 * Discriminated on `status` so each variant carries only the fields it can back:
 * a value to aim for exists only when growth can actually overtake saving, and an
 * ETA only when today's value is short of that target.
 */
export type FireTargetResult =
  /** The portfolio can't grow (non-positive return), so no target value exists. */
  | (FireTargetBase & { status: 'unreachable'; reason: 'noReturn' })
  /** Growth already covers the target share at today's value. */
  | (FireTargetBase & { status: 'reached'; portfolioValueNeeded: number })
  /** Below the target today; the gap and the years to close it both hold. */
  | (FireTargetBase & {
      status: 'projected';
      portfolioValueNeeded: number;
      gap: number;
      yearsToTarget: number;
    });

/**
 * The portfolio value at which growth covers the target share of a month's
 * net-worth gain, and how long today's value takes to get there.
 *
 * "Growth" is modelled as `portfolioValue * monthlyReturn`; a month's net-worth
 * gain is that growth plus the month's saving. Setting the growth share equal to
 * the target and solving gives the needed value; the ETA is the future-value
 * projection of today's value plus a monthly contribution. It is a straight
 * assumption-driven forecast — the caller shows the inputs it rests on — not a
 * guarantee.
 */
export const computeFireTarget = ({
  currentPortfolioValue,
  monthlySavings,
  annualReturnRatePct,
  targetGrowthSharePct,
}: FireTargetInput): FireTargetResult => {
  const monthlyReturn = annualReturnRatePct / 100 / MONTHS_PER_YEAR;
  const target = Math.min(Math.max(targetGrowthSharePct / 100, 0), MAX_TARGET_FRACTION);

  const monthlyGrowthNow = currentPortfolioValue * monthlyReturn;
  const monthlyGainNow = monthlyGrowthNow + monthlySavings;

  // When a net drawdown wipes out the month's gain, growth is still the only thing
  // pushing the portfolio up, so it covers the full share.
  let currentGrowthSharePct: number;
  if (monthlyGainNow > 0) {
    currentGrowthSharePct = (monthlyGrowthNow / monthlyGainNow) * 100;
  } else if (monthlyGrowthNow > 0) {
    currentGrowthSharePct = 100;
  } else {
    currentGrowthSharePct = 0;
  }

  // A flat or shrinking portfolio never lets growth overtake saving, so there is
  // no finite value to aim for.
  if (monthlyReturn <= 0) return { status: 'unreachable', reason: 'noReturn', currentGrowthSharePct };

  // With nothing set aside, growth is already the whole of every month's gain —
  // the crossover sits at any positive portfolio value.
  if (monthlySavings <= 0) return { status: 'reached', portfolioValueNeeded: 0, currentGrowthSharePct };

  const portfolioValueNeeded = (target / (1 - target)) * (monthlySavings / monthlyReturn);

  if (currentPortfolioValue >= portfolioValueNeeded) {
    return { status: 'reached', portfolioValueNeeded, currentGrowthSharePct };
  }

  // Months for the future value of today's holdings plus a monthly contribution
  // to reach the needed value: (1 + r)^n = (T + C/r) / (P + C/r).
  const contributionOverReturn = monthlySavings / monthlyReturn;
  const growthFactor =
    (portfolioValueNeeded + contributionOverReturn) / (currentPortfolioValue + contributionOverReturn);
  const monthsToTarget = Math.log(growthFactor) / Math.log(1 + monthlyReturn);

  return {
    status: 'projected',
    portfolioValueNeeded,
    gap: portfolioValueNeeded - currentPortfolioValue,
    yearsToTarget: monthsToTarget / MONTHS_PER_YEAR,
    currentGrowthSharePct,
  };
};
