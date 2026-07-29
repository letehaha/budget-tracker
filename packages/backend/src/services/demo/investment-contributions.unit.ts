// resolveContributions decides every number the Investment Contributions report
// shows for demo users: the funding transfers must add up to the buys plus the
// ending cash, or the PortfolioBalances row contradicts the transfers.

import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';

import { resolveContributions } from './investment-contributions';

const sumOf = (plans: { amount: Money }[]) => Money.sum(plans.map((plan) => plan.amount));

describe('resolveContributions', () => {
  it('gives the placeholder entry whatever the fixed entries do not cover', () => {
    const plans = resolveContributions({
      contributions: [
        { daysAgo: 950, amount: 2500, description: 'Brokerage account funding' },
        { daysAgo: 700, amount: 2000, description: 'Monthly investing transfer' },
        { daysAgo: 120, amount: null, description: 'Brokerage top-up' },
      ],
      totalNeeded: Money.fromDecimal(7000),
    });

    expect(plans.map((plan) => plan.amount.toNumber())).toEqual([2500, 2000, 2500]);
    expect(sumOf(plans).equals(Money.fromDecimal(7000))).toBe(true);
  });

  it('keeps daysAgo and description alongside the resolved amount', () => {
    const plans = resolveContributions({
      contributions: [
        { daysAgo: 860, amount: 6500, description: 'Crypto exchange funding' },
        { daysAgo: 60, amount: null, description: 'Crypto exchange top-up' },
      ],
      totalNeeded: Money.fromDecimal(8000),
    });

    expect(
      plans.map((plan) => ({ daysAgo: plan.daysAgo, description: plan.description, amount: plan.amount.toNumber() })),
    ).toEqual([
      { daysAgo: 860, description: 'Crypto exchange funding', amount: 6500 },
      { daysAgo: 60, description: 'Crypto exchange top-up', amount: 1500 },
    ]);
  });

  it('resolves a fractional remainder without floating-point drift', () => {
    const plans = resolveContributions({
      contributions: [
        { daysAgo: 300, amount: 1000, description: 'Fixed' },
        { daysAgo: 100, amount: null, description: 'Placeholder' },
      ],
      // 6300 (0.15 BTC at 42000) + 1500 ending cash, the shape the crypto plan produces.
      totalNeeded: Money.fromDecimal(6300).add(Money.fromDecimal(1500.1)),
    });

    expect(plans.map((plan) => plan.amount.toDecimalString(2))).toEqual(['1000.00', '6800.10']);
    expect(sumOf(plans).toDecimalString(2)).toBe('7800.10');
  });

  it('throws at the boundary where the fixed entries exactly cover what is needed', () => {
    // Equality leaves the placeholder at zero, which would write a $0 funding
    // transfer, so it is rejected the same way an overshoot is.
    expect(() =>
      resolveContributions({
        contributions: [
          { daysAgo: 900, amount: 4000, description: 'Fixed' },
          { daysAgo: 100, amount: null, description: 'Placeholder' },
        ],
        totalNeeded: Money.fromDecimal(4000),
      }),
    ).toThrow(/leave nothing for the placeholder entry/);
  });

  it('throws when the fixed entries exceed what is needed', () => {
    expect(() =>
      resolveContributions({
        contributions: [
          { daysAgo: 900, amount: 4000, description: 'Fixed' },
          { daysAgo: 600, amount: 3000, description: 'Fixed' },
          { daysAgo: 100, amount: null, description: 'Placeholder' },
        ],
        totalNeeded: Money.fromDecimal(5000),
      }),
    ).toThrow(/fixed contributions \(7000\).*funding needed: 5000/);
  });
});
