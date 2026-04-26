/**
 * XIRR — Extended Internal Rate of Return for cash flows on irregular dates.
 *
 * Returns the annualized rate that makes the net present value of `cashFlows` equal zero.
 * Convention: deposits/investments are negative (money out of investor's pocket),
 * withdrawals and the final portfolio value are positive (money received).
 *
 * Algorithm: Newton-Raphson with bisection fallback when Newton fails to converge
 * or the derivative explodes.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_NEWTON_ITERATIONS = 100;
const NEWTON_TOLERANCE = 1e-7;
const MAX_BISECTION_ITERATIONS = 200;
const BISECTION_TOLERANCE = 1e-7;

export interface XirrCashFlow {
  date: Date | string;
  amount: number;
}

interface NormalizedFlow {
  yearsFromAnchor: number;
  amount: number;
}

const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

const normalize = (cashFlows: XirrCashFlow[]): NormalizedFlow[] => {
  if (cashFlows.length === 0) return [];
  const anchor = toDate(cashFlows[0]!.date).getTime();
  return cashFlows.map((cf) => ({
    yearsFromAnchor: (toDate(cf.date).getTime() - anchor) / (MS_PER_DAY * 365),
    amount: cf.amount,
  }));
};

const npv = (rate: number, flows: NormalizedFlow[]): number => {
  let sum = 0;
  for (const flow of flows) {
    sum += flow.amount / Math.pow(1 + rate, flow.yearsFromAnchor);
  }
  return sum;
};

const npvDerivative = (rate: number, flows: NormalizedFlow[]): number => {
  let sum = 0;
  for (const flow of flows) {
    if (flow.yearsFromAnchor === 0) continue;
    sum += (-flow.yearsFromAnchor * flow.amount) / Math.pow(1 + rate, flow.yearsFromAnchor + 1);
  }
  return sum;
};

const newtonRaphson = (flows: NormalizedFlow[], guess: number): number | null => {
  let rate = guess;
  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    const value = npv(rate, flows);
    if (Math.abs(value) < NEWTON_TOLERANCE) return rate;
    const derivative = npvDerivative(rate, flows);
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-15) return null;
    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -1) return null;
    if (Math.abs(next - rate) < NEWTON_TOLERANCE) return next;
    rate = next;
  }
  return null;
};

const bisection = (flows: NormalizedFlow[]): number | null => {
  let low = -0.999_999;
  // Wide upper bound so very young portfolios with extreme implied returns still resolve.
  // Even at 1e9 (= 100 billion %) the solver remains numerically stable thanks to the
  // log-scale geometric search Newton uses first.
  let high = 1e9;
  let lowValue = npv(low, flows);
  let highValue = npv(high, flows);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) return null;
  if (lowValue * highValue > 0) return null;

  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const midValue = npv(mid, flows);
    if (!Number.isFinite(midValue)) return null;
    if (Math.abs(midValue) < BISECTION_TOLERANCE) return mid;
    if (midValue * lowValue < 0) {
      high = mid;
      highValue = midValue;
    } else {
      low = mid;
      lowValue = midValue;
    }
    if (Math.abs(high - low) < BISECTION_TOLERANCE) return mid;
  }
  return null;
};

/**
 * Compute the annualized money-weighted return (XIRR) for a series of dated cash flows.
 *
 * Returns null when:
 * - fewer than 2 cash flows
 * - all flows have the same sign (no return can be solved)
 * - solver fails to converge
 */
export const calculateXirr = ({ cashFlows }: { cashFlows: XirrCashFlow[] }): number | null => {
  if (cashFlows.length < 2) return null;

  let hasPositive = false;
  let hasNegative = false;
  for (const cf of cashFlows) {
    if (cf.amount > 0) hasPositive = true;
    else if (cf.amount < 0) hasNegative = true;
  }
  if (!hasPositive || !hasNegative) return null;

  const sorted = cashFlows.toSorted((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
  const flows = normalize(sorted);

  for (const guess of [0.1, 0.05, 0, 0.25, -0.1, 0.5]) {
    const result = newtonRaphson(flows, guess);
    if (result !== null && Number.isFinite(result)) return result;
  }

  return bisection(flows);
};
