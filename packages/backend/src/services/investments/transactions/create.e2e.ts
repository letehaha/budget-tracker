import { ASSET_CLASS, INVESTMENT_TRANSACTION_CATEGORY, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import * as helpers from '@tests/helpers';

describe('POST /transaction (create investment transaction)', () => {
  let investmentPortfolio: Portfolios;
  let vooSecurity: Securities;

  beforeEach(async () => {
    investmentPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({
        name: 'Test Investment Portfolio',
      }),
      raw: true,
    });

    const seededSecurities: Securities[] = await helpers.seedSecurities([
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
    ]);
    vooSecurity = seededSecurities.find((s) => s.symbol === 'VOO')!;
    if (!vooSecurity) throw new Error('VOO security not found after seeding');

    await helpers.createHolding({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
      },
    });
  });

  it('should create a buy transaction successfully', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '2',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(201);
    const transaction = helpers.extractResponse(response);
    expect(transaction.portfolioId).toBe(investmentPortfolio.id);
    expect(transaction.securityId).toBe(vooSecurity.id);
    expect(transaction.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.buy);
    expect(transaction.quantity).toBeNumericEqual(2);
    expect(transaction.price).toBeNumericEqual(50);

    // Verify holding was updated
    const [holding] = await helpers.getHoldings({
      portfolioId: investmentPortfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holding).toBeTruthy();
    expect(holding!.quantity).toBeNumericEqual(2);
    expect(holding!.costBasis).toBeNumericEqual(100);
  });

  it('should create a sell transaction successfully', async () => {
    // First create a buy transaction to have shares to sell
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '5',
        price: '40',
      },
    });

    // Now create the sell transaction
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        quantity: '2',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(201);
    const transaction = helpers.extractResponse(response);
    expect(transaction.portfolioId).toBe(investmentPortfolio.id);
    expect(transaction.securityId).toBe(vooSecurity.id);
    expect(transaction.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.sell);
    expect(transaction.quantity).toBeNumericEqual(2);
    expect(transaction.price).toBeNumericEqual(50);

    // Verify holding was updated
    const [holding] = await helpers.getHoldings({
      portfolioId: investmentPortfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holding).toBeTruthy();
    expect(holding!.quantity).toBeNumericEqual(3);
    expect(holding!.costBasis).toBeNumericEqual(120);
  });

  it('should reject a sell transaction with insufficient shares', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        quantity: '1',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should fail to create a transaction for non-existent portfolio', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: generateRandomRecordId(),
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '1',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should fail to create a transaction for non-existent security', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: generateRandomRecordId(),
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '1',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should fail to create a transaction with invalid quantity', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '-1',
        price: '50',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should fail to create a transaction with invalid price', async () => {
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '1',
        price: '-50',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('accepts a zero-price buy (staking reward, airdrop, balance adjustment)', async () => {
    // A zero-price BUY is a real position change with no cash consideration —
    // staking rewards, airdrops, "balance adjustment for missing tokens", etc.
    // Quantity must still go up; cost basis is just the fee (often zero too).
    const response = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: investmentPortfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '3',
        price: '0',
      },
    });

    expect(response.statusCode).toBe(201);
    const tx = helpers.extractResponse(response);
    expect(tx.price).toBeNumericEqual(0);
    expect(tx.quantity).toBeNumericEqual(3);

    const [holding] = await helpers.getHoldings({
      portfolioId: investmentPortfolio.id,
      payload: { securityId: vooSecurity.id },
      raw: true,
    });
    expect(holding!.quantity).toBeNumericEqual(3);
    // No price paid, no fees → cost basis stays at zero.
    expect(holding!.costBasis).toBeNumericEqual(0);
  });

  describe('crypto sell oversell', () => {
    let btcSecurity: Securities;

    beforeEach(async () => {
      btcSecurity = await Securities.create({
        symbol: 'BTC',
        providerSymbol: 'bitcoin',
        name: 'Bitcoin',
        assetClass: ASSET_CLASS.crypto,
        providerName: SECURITY_PROVIDER.coingecko,
        currencyCode: 'USD',
      });

      await helpers.createHolding({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: btcSecurity.id,
        },
      });
    });

    it('allows selling crypto with no prior holdings (drift correction)', async () => {
      const response = await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: btcSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '0.5',
          price: '60000',
        },
      });

      expect(response.statusCode).toBe(201);
      const transaction = helpers.extractResponse(response);
      expect(transaction.quantity).toBeNumericEqual(0.5);

      const [holding] = await helpers.getHoldings({
        portfolioId: investmentPortfolio.id,
        payload: { securityId: btcSecurity.id },
        raw: true,
      });
      expect(holding!.quantity).toBeNumericEqual(-0.5);
    });

    it('allows selling more crypto than owned (staking/fee drift)', async () => {
      // Buy 1 BTC first
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: btcSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '1',
          price: '50000',
        },
      });

      // Now sell 1.5 BTC even though only 1 is tracked
      const response = await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: btcSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '1.5',
          price: '60000',
        },
      });

      expect(response.statusCode).toBe(201);

      const [holding] = await helpers.getHoldings({
        portfolioId: investmentPortfolio.id,
        payload: { securityId: btcSecurity.id },
        raw: true,
      });
      expect(holding!.quantity).toBeNumericEqual(-0.5);
    });

    it('does not inflate cost basis when sells happen while quantity is negative', async () => {
      // Regression test for a bug observed after importing a Yahoo crypto CSV
      // (weighted-average accounting on FIFO-style data): once running quantity
      // dipped negative and subsequent BUYs accumulated cost while still short,
      // each later SELL flipped the `quantity / totalQuantity` proportion sign
      // and ADDED to cost basis instead of reducing it. A 0.28 BTC ending
      // position ended up showing $1.27M cost basis on production data.
      const txs: { category: INVESTMENT_TRANSACTION_CATEGORY; quantity: string; price: string; date: string }[] = [
        // Build a long position
        { category: INVESTMENT_TRANSACTION_CATEGORY.buy, quantity: '0.5', price: '50000', date: '2024-01-01' },
        // Oversell — qty drops to -0.5 (allowed for crypto)
        { category: INVESTMENT_TRANSACTION_CATEGORY.sell, quantity: '1.0', price: '60000', date: '2024-02-01' },
        // Buy that does NOT bring qty above zero (would have leaked +cost in old code)
        { category: INVESTMENT_TRANSACTION_CATEGORY.buy, quantity: '0.2', price: '100000', date: '2024-03-01' },
        // Two sells while still short — old code would inflate cost basis here
        { category: INVESTMENT_TRANSACTION_CATEGORY.sell, quantity: '0.1', price: '120000', date: '2024-04-01' },
        { category: INVESTMENT_TRANSACTION_CATEGORY.sell, quantity: '0.1', price: '120000', date: '2024-05-01' },
      ];

      for (const tx of txs) {
        const res = await helpers.createInvestmentTransaction({
          payload: {
            portfolioId: investmentPortfolio.id,
            securityId: btcSecurity.id,
            category: tx.category,
            quantity: tx.quantity,
            price: tx.price,
            date: tx.date,
          },
        });
        expect(res.statusCode).toBe(201);
      }

      const [holding] = await helpers.getHoldings({
        portfolioId: investmentPortfolio.id,
        payload: { securityId: btcSecurity.id },
        raw: true,
      });

      // qty: 0.5 - 1.0 + 0.2 - 0.1 - 0.1 = -0.5
      expect(holding!.quantity).toBeNumericEqual(-0.5);

      // Position is net short — there is no long position to attribute cost to,
      // so cost basis must be zero. Old buggy code produced a positive cost
      // basis here (the proportion flip kept inflating it).
      expect(holding!.costBasis).toBeNumericEqual(0);
      expect(holding!.refCostBasis).toBeNumericEqual(0);
    });

    it('starts a fresh cost basis when a buy brings a short position back to long', async () => {
      // After a crypto position goes short and a later buy crosses back into a
      // long position, only the qty *above zero* should establish new basis —
      // the portion that covered the short is a separate P&L event, not a cost.
      // Buy 0.5, sell 1.0 → qty=-0.5
      // Buy 2.0 at $100k → covers 0.5 short + leaves 1.5 long; long basis = 1.5 * $100k
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: btcSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '0.5',
          price: '50000',
          date: '2024-01-01',
        },
      });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: btcSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          quantity: '1.0',
          price: '60000',
          date: '2024-02-01',
        },
      });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: investmentPortfolio.id,
          securityId: btcSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          quantity: '2.0',
          price: '100000',
          date: '2024-03-01',
        },
      });

      const [holding] = await helpers.getHoldings({
        portfolioId: investmentPortfolio.id,
        payload: { securityId: btcSecurity.id },
        raw: true,
      });

      expect(holding!.quantity).toBeNumericEqual(1.5);
      // 1.5 BTC at $100k each = $150k. The covering 0.5 BTC of the same buy is
      // P&L on the short, not cost basis on the new long.
      expect(holding!.costBasis).toBeNumericEqual(150000);
    });
  });
});
