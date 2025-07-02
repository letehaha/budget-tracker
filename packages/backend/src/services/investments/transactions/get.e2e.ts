import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Holdings from '@models/investments/Holdings.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import * as helpers from '@tests/helpers';

const { createAccount, buildAccountPayload } = helpers;
const { createPortfolio, buildPortfolioPayload } = helpers;
const { createInvestmentTransaction, getInvestmentTransactions } = helpers;
const { seedSecuritiesViaSync } = helpers;
const { extractResponse } = helpers;

describe('GET /transactions (get investment transactions)', () => {
  let investmentPortfolio: Portfolios;
  let investmentAccount: Accounts;
  let security: Securities;

  beforeEach(async () => {
    // Create portfolio for transactions
    investmentPortfolio = await createPortfolio({
      payload: buildPortfolioPayload({
        name: 'Test Investment Portfolio',
      }),
      raw: true,
    });

    // Create account for holding creation (backward compatibility)
    const usdCurrency = global.MODELS_CURRENCIES.find((c: { code: string }) => c.code === 'USD');
    const currencyToUse = usdCurrency || global.BASE_CURRENCY;

    investmentAccount = await createAccount({
      payload: buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.investment,
        currencyId: currencyToUse.id,
      }),
      raw: true,
    });

    // Create test security
    const securities = await seedSecuritiesViaSync([{ symbol: 'VOO', name: 'Vanguard S&P 500 ETF' }]);
    security = securities.find((s) => s.symbol === 'VOO')!;
    if (!security) throw new Error('VOO security not found after seeding');

    // Create holding with both portfolioId and accountId
    await Holdings.create({
      portfolioId: investmentPortfolio.id,
      accountId: investmentAccount.id,
      securityId: security.id,
      quantity: '0',
      costBasis: '0',
      refCostBasis: '0',
      value: '0',
      refValue: '0',
      currencyCode: 'USD',
    });
  });

  it('should retrieve paginated transactions correctly', async () => {
    // Create 25 transactions for pagination testing
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        createInvestmentTransaction({
          payload: {
            portfolioId: investmentPortfolio.id,
            securityId: security.id,
            category: INVESTMENT_TRANSACTION_CATEGORY.buy,
            date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
            quantity: '1',
            price: '100',
          },
        }),
      ),
    );

    // Test default pagination (limit: 20, offset: 0)
    const response = await getInvestmentTransactions({});
    expect(response.statusCode).toBe(200);
    const { transactions, total, limit, offset } = extractResponse(response);
    expect(transactions).toHaveLength(20);
    expect(total).toBe(25);
    expect(limit).toBe(20);
    expect(offset).toBe(0);

    // Test custom pagination
    const customResponse = await getInvestmentTransactions({
      limit: 10,
      offset: 20,
    });
    expect(customResponse.statusCode).toBe(200);
    const customData = extractResponse(customResponse);
    expect(customData.transactions).toHaveLength(5);
    expect(customData.total).toBe(25);
    expect(customData.limit).toBe(10);
    expect(customData.offset).toBe(20);
  });

  it('should filter transactions by various criteria', async () => {
    // Create additional test portfolios
    const portfolio1 = await createPortfolio({
      payload: buildPortfolioPayload({
        name: 'Portfolio 1',
      }),
      raw: true,
    });

    const portfolio2 = await createPortfolio({
      payload: buildPortfolioPayload({
        name: 'Portfolio 2',
      }),
      raw: true,
    });

    // Create additional accounts for holdings (backward compatibility)
    const account1 = await createAccount({
      payload: buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.investment,
        currencyId: (global.MODELS_CURRENCIES.find((c: { code: string }) => c.code === 'USD') || global.BASE_CURRENCY)
          .id,
      }),
      raw: true,
    });

    const account2 = await createAccount({
      payload: buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.investment,
        currencyId: (global.MODELS_CURRENCIES.find((c: { code: string }) => c.code === 'USD') || global.BASE_CURRENCY)
          .id,
      }),
      raw: true,
    });

    // Create test securities
    const securities = await seedSecuritiesViaSync([
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
      { symbol: 'AAPL', name: 'Apple Inc.' },
    ]);
    if (!securities.length) throw new Error('Failed to create securities');
    const [vooSecurity, aaplSecurity] = securities;
    if (!vooSecurity || !aaplSecurity) throw new Error('Failed to get securities');

    // Create holdings for both portfolios and securities
    await Holdings.create({
      portfolioId: portfolio1.id,
      accountId: account1.id,
      securityId: vooSecurity.id,
      quantity: '0',
      costBasis: '0',
      refCostBasis: '0',
      value: '0',
      refValue: '0',
      currencyCode: 'USD',
    });

    await Holdings.create({
      portfolioId: portfolio1.id,
      accountId: account1.id,
      securityId: aaplSecurity.id,
      quantity: '0',
      costBasis: '0',
      refCostBasis: '0',
      value: '0',
      refValue: '0',
      currencyCode: 'USD',
    });

    await Holdings.create({
      portfolioId: portfolio2.id,
      accountId: account2.id,
      securityId: vooSecurity.id,
      quantity: '0',
      costBasis: '0',
      refCostBasis: '0',
      value: '0',
      refValue: '0',
      currencyCode: 'USD',
    });

    // Create transactions with different properties for filtering tests
    // Portfolio 1, VOO, Buy, Jan 1
    await createInvestmentTransaction({
      payload: {
        portfolioId: portfolio1.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2024-01-01',
        quantity: '1',
        price: '100',
      },
    });

    // Portfolio 1, AAPL, Buy, Feb 1
    await createInvestmentTransaction({
      payload: {
        portfolioId: portfolio1.id,
        securityId: aaplSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2024-02-01',
        quantity: '2',
        price: '200',
      },
    });

    // Portfolio 1, VOO, Sell, Mar 1
    await createInvestmentTransaction({
      payload: {
        portfolioId: portfolio1.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        date: '2024-03-01',
        quantity: '0.5',
        price: '110',
      },
    });

    // Portfolio 2, VOO, Buy, Apr 1
    await createInvestmentTransaction({
      payload: {
        portfolioId: portfolio2.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2024-04-01',
        quantity: '3',
        price: '105',
      },
    });

    // Test 1: Filter by portfolio
    const portfolioFilterResponse = await getInvestmentTransactions({
      portfolioId: portfolio1.id,
    });
    expect(portfolioFilterResponse.statusCode).toBe(200);
    const portfolioFilterData = extractResponse(portfolioFilterResponse);
    expect(portfolioFilterData.transactions).toHaveLength(3);
    expect(portfolioFilterData.transactions.every((tx) => tx.portfolioId === portfolio1.id)).toBe(true);

    // Test 2: Filter by security
    const securityFilterResponse = await getInvestmentTransactions({
      securityId: vooSecurity.id,
    });
    expect(securityFilterResponse.statusCode).toBe(200);
    const securityFilterData = extractResponse(securityFilterResponse);
    expect(securityFilterData.transactions).toHaveLength(3);
    expect(securityFilterData.transactions.every((tx) => tx.securityId === vooSecurity.id)).toBe(true);

    // Test 3: Filter by category
    const categoryFilterResponse = await getInvestmentTransactions({
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
    });
    expect(categoryFilterResponse.statusCode).toBe(200);
    const categoryFilterData = extractResponse(categoryFilterResponse);
    expect(categoryFilterData.transactions).toHaveLength(3);
    expect(categoryFilterData.transactions.every((tx) => tx.category === INVESTMENT_TRANSACTION_CATEGORY.buy)).toBe(
      true,
    );

    // Test 4: Filter by date range
    const dateFilterResponse = await getInvestmentTransactions({
      startDate: '2024-02-15',
      endDate: '2024-04-15',
    });
    expect(dateFilterResponse.statusCode).toBe(200);
    const dateFilterData = extractResponse(dateFilterResponse);
    expect(dateFilterData.transactions).toHaveLength(2);
    expect(
      dateFilterData.transactions.every((tx) => {
        const txDate = new Date(tx.date);
        return txDate >= new Date('2024-02-15') && txDate <= new Date('2024-04-15');
      }),
    ).toBe(true);

    // Test 5: Combined filters
    const combinedFilterResponse = await getInvestmentTransactions({
      portfolioId: portfolio1.id,
      securityId: vooSecurity.id,
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
    });
    expect(combinedFilterResponse.statusCode).toBe(200);
    const combinedFilterData = extractResponse(combinedFilterResponse);
    expect(combinedFilterData.transactions).toHaveLength(1);
    expect(combinedFilterData.transactions[0]!.portfolioId).toBe(portfolio1.id);
    expect(combinedFilterData.transactions[0]!.securityId).toBe(vooSecurity.id);
    expect(combinedFilterData.transactions[0]!.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.buy);
  });

  it('should return 404 for non-existent portfolio', async () => {
    const response = await getInvestmentTransactions({
      portfolioId: 999999,
    });
    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });
});
