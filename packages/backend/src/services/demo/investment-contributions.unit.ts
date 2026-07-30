// resolveContributions decides every number the Investment Contributions report
// shows for demo users: the funding transfers must add up to the buys plus the
// ending cash, or the PortfolioBalances row contradicts the transfers.

import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';

import { resolveContributions } from './investment-contributions';

const sumOf = (plans: { amount: Money }[]) => Money.sum(plans.map((plan) => plan.amount));

describe('resolveContributions', () => {
  it('gives the placeholder entry whatever the shares do not cover', () => {
    const plans = resolveContributions({
      contributions: [
        { daysAgo: 950, share: 0.25, description: 'Brokerage account funding' },
        { daysAgo: 700, share: 0.2, description: 'Monthly investing transfer' },
        { daysAgo: 120, share: null, description: 'Brokerage top-up' },
      ],
      totalNeeded: Money.fromDecimal(8000),
    });

    expect(plans.map((plan) => plan.amount.toNumber())).toEqual([2000, 1600, 4400]);
    expect(sumOf(plans).equals(Money.fromDecimal(8000))).toBe(true);
  });

  it('keeps daysAgo and description alongside the resolved amount', () => {
    const plans = resolveContributions({
      contributions: [
        { daysAgo: 860, share: 0.8, description: 'Crypto exchange funding' },
        { daysAgo: 60, share: null, description: 'Crypto exchange top-up' },
      ],
      totalNeeded: Money.fromDecimal(8000),
    });

    expect(
      plans.map((plan) => ({ daysAgo: plan.daysAgo, description: plan.description, amount: plan.amount.toNumber() })),
    ).toEqual([
      { daysAgo: 860, description: 'Crypto exchange funding', amount: 6400 },
      { daysAgo: 60, description: 'Crypto exchange top-up', amount: 1600 },
    ]);
  });

  it('scales with the market instead of breaking when holdings get expensive', () => {
    // The reason shares replaced dollar amounts: demo buys are priced from real
    // market data, so the same config has to fund a portfolio at any price level.
    const contributions = [
      { daysAgo: 860, share: 0.43, description: 'Crypto exchange funding' },
      { daysAgo: 600, share: 0.33, description: 'Crypto exchange funding' },
      { daysAgo: 60, share: null, description: 'Crypto exchange top-up' },
    ];

    for (const total of [5_000, 50_000, 500_000]) {
      const plans = resolveContributions({ contributions, totalNeeded: Money.fromDecimal(total) });

      expect(sumOf(plans).equals(Money.fromDecimal(total))).toBe(true);
      expect(plans.every((plan) => plan.amount.isPositive())).toBe(true);
    }
  });

  it('lets the placeholder absorb share rounding so the total stays exact', () => {
    const plans = resolveContributions({
      contributions: [
        { daysAgo: 300, share: 1 / 3, description: 'Fixed' },
        { daysAgo: 100, share: null, description: 'Placeholder' },
      ],
      totalNeeded: Money.fromDecimal(1000.1),
    });

    expect(sumOf(plans).equals(Money.fromDecimal(1000.1))).toBe(true);
  });

  it('throws at the boundary where the shares exactly cover what is needed', () => {
    // Equality leaves the placeholder at zero, which would write a $0 funding
    // transfer, so it is rejected the same way an overshoot is.
    expect(() =>
      resolveContributions({
        contributions: [
          { daysAgo: 900, share: 1, description: 'Fixed' },
          { daysAgo: 100, share: null, description: 'Placeholder' },
        ],
        totalNeeded: Money.fromDecimal(4000),
      }),
    ).toThrow(/leave nothing for the placeholder entry/);
  });

  it('throws when the shares exceed the whole', () => {
    expect(() =>
      resolveContributions({
        contributions: [
          { daysAgo: 900, share: 0.8, description: 'Fixed' },
          { daysAgo: 600, share: 0.6, description: 'Fixed' },
          { daysAgo: 100, share: null, description: 'Placeholder' },
        ],
        totalNeeded: Money.fromDecimal(5000),
      }),
    ).toThrow(/leave nothing for the placeholder entry/);
  });
});
