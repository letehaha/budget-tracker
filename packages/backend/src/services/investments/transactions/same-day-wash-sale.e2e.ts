import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import * as helpers from '@tests/helpers';

/**
 * Cost-basis replay ordering for same-day SELL+BUY, exercised through the real
 * create-transaction HTTP path.
 *
 * A holding's cost basis represents the cost of the *current* long position.
 * When the whole position is sold and rebought on the same calendar date (a
 * wash sale), AC/Share must reflect only the rebuy lot — the liquidated lots
 * are gone and must not blend into it. Recalculation replays transactions in
 * (date, createdAt) order: `date` settles the calendar day, `createdAt` settles
 * same-day order so the sell drains the position to zero (resetting the basis)
 * before the rebuy rebuilds it.
 *
 * Scope of these tests: they confirm the fold + recalc trigger produce the right
 * basis end-to-end, and the back-dated case below has real teeth for the `date`
 * dimension. They do NOT reproduce the original nondeterministic-ordering bug:
 * on a fresh DB Postgres returns same-day rows in insertion order regardless of
 * the `createdAt` tiebreaker, so these would pass even with the tiebreaker
 * removed. The deterministic regression guard for the tiebreaker (same legs,
 * two orders → different basis) lives in `holding-totals.unit.ts`.
 */
describe('Same-day SELL+BUY cost-basis ordering', () => {
  let investmentPortfolio: Portfolios;
  let security: Securities;

  beforeEach(async () => {
    investmentPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Wash Sale Test Portfolio' }),
      raw: true,
    });

    const seededSecurities: Securities[] = await helpers.seedSecurities([
      { symbol: 'MSFT', name: 'Microsoft Corporation' },
    ]);
    const seededMsft = seededSecurities.find((s) => s.symbol === 'MSFT');
    if (!seededMsft) throw new Error('MSFT security not found after seeding');
    security = seededMsft;

    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: security.id,
      },
    });
  });

  const getHolding = async () => {
    const [holding] = await helpers.getHoldings({
      portfolioId: investmentPortfolio.id,
      payload: { securityId: security.id },
      raw: true,
    });
    expect(holding).toBeTruthy();
    return holding!;
  };

  it('resets cost basis to the rebuy lot when the full position is sold then rebought same day', async () => {
    // Old cheap lot — must NOT bleed into AC/Share after the wash sale.
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: security.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2026-01-01',
        quantity: '10',
        price: '50',
      },
    });

    // Sell the entire position (basis resets to 0).
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: security.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        date: '2026-03-01',
        quantity: '10',
        price: '60',
      },
    });

    // Rebuy the position the same day (new lot only).
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: security.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2026-03-01',
        quantity: '10',
        price: '70',
      },
    });

    const holding = await getHolding();
    expect(holding.quantity).toBeNumericEqual(10);
    // 10 @ $70 = $700, NOT $500 (old lot) or any blend of the two.
    expect(holding.costBasis).toBeNumericEqual(700);
  });

  it('keeps the surviving lot plus the rebuy on a partial same-day wash sale', async () => {
    // 20 @ $40 → basis $800.
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: security.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2026-01-01',
        quantity: '20',
        price: '40',
      },
    });

    // Sell 15 → 5 survive, basis reduces proportionally to $200.
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: security.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        date: '2026-03-01',
        quantity: '15',
        price: '50',
      },
    });

    // Rebuy 15 @ $60 the same day → adds $900.
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: security.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2026-03-01',
        quantity: '15',
        price: '60',
      },
    });

    const holding = await getHolding();
    expect(holding.quantity).toBeNumericEqual(20);
    // 5 surviving @ $40 ($200) + 15 new @ $60 ($900) = $1100.
    expect(holding.costBasis).toBeNumericEqual(1100);
  });

  it('resets to the latest lot across multiple sell-all/rebuy cycles on the same day', async () => {
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: security.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2026-01-01',
        quantity: '10',
        price: '50',
      },
    });

    // Three sell-all/rebuy cycles, all on the same day, in insertion order.
    const sameDayCycle: Array<{ category: INVESTMENT_TRANSACTION_CATEGORY; price: string }> = [
      { category: INVESTMENT_TRANSACTION_CATEGORY.sell, price: '60' },
      { category: INVESTMENT_TRANSACTION_CATEGORY.buy, price: '70' },
      { category: INVESTMENT_TRANSACTION_CATEGORY.sell, price: '80' },
      { category: INVESTMENT_TRANSACTION_CATEGORY.buy, price: '90' },
    ];
    for (const leg of sameDayCycle) {
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: security.id,
          category: leg.category,
          date: '2026-03-01',
          quantity: '10',
          price: leg.price,
        },
      });
    }

    const holding = await getHolding();
    expect(holding.quantity).toBeNumericEqual(10);
    // Only the final rebuy survives: 10 @ $90 = $900.
    expect(holding.costBasis).toBeNumericEqual(900);
  });

  it('replays by calendar date, not insertion order, when a sell is back-dated between two buys', async () => {
    // Inserted first, earliest date.
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: security.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2026-01-01',
        quantity: '10',
        price: '50',
      },
    });

    // Inserted second, latest date — this is the lot that must survive.
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: security.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2026-03-05',
        quantity: '10',
        price: '70',
      },
    });

    // Inserted last but dated BETWEEN the two buys. By date it liquidates the
    // first lot before the second is bought; by insertion order it would wrongly
    // sell against the combined position and leave a blended basis.
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: security.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        date: '2026-02-01',
        quantity: '10',
        price: '60',
      },
    });

    const holding = await getHolding();
    expect(holding.quantity).toBeNumericEqual(10);
    // Date order (buy@50 → sell-all → buy@70) leaves 10 @ $70 = $700.
    // Insertion order would have left a blended $600 — this asserts the former.
    expect(holding.costBasis).toBeNumericEqual(700);
  });
});
