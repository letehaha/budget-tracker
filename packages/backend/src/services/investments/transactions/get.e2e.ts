import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import { buildAccountPayload, createAccount, extractResponse } from '@tests/helpers';
import { createHolding } from '@tests/helpers/investments/holdings';
import { seedSecuritiesViaSync } from '@tests/helpers/investments/securities';
import { createInvestmentTransaction, getInvestmentTransactions } from '@tests/helpers/investments/transactions';

describe('GET /investing/transactions', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  it('should get transactions with pagination', async () => {
    const account = await createAccount({
      payload: buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.investment,
        name: 'Investments',
      }),
      raw: true,
    });
    const [security] = await seedSecuritiesViaSync([{ symbol: 'VOO', name: 'Vanguard S&P 500 ETF' }]);
    if (!security) throw new Error('Failed to create security');

    await createHolding({
      payload: {
        accountId: account.id,
        securityId: security.id,
      },
    });

    // Create 25 transactions
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        createInvestmentTransaction({
          payload: {
            accountId: account.id,
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
    // Create test accounts
    const account1 = await createAccount({
      payload: buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.investment,
        name: 'Investments 1',
      }),
      raw: true,
    });

    const account2 = await createAccount({
      payload: buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.investment,
        name: 'Investments 2',
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

    // Create holdings for both accounts and securities
    await createHolding({
      payload: {
        accountId: account1.id,
        securityId: vooSecurity.id,
      },
    });

    await createHolding({
      payload: {
        accountId: account1.id,
        securityId: aaplSecurity.id,
      },
    });

    await createHolding({
      payload: {
        accountId: account2.id,
        securityId: vooSecurity.id,
      },
    });

    // Create transactions with different properties for filtering tests
    // Account 1, VOO, Buy, Jan 1
    await createInvestmentTransaction({
      payload: {
        accountId: account1.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2024-01-01',
        quantity: '1',
        price: '100',
      },
    });

    // Account 1, AAPL, Buy, Feb 1
    await createInvestmentTransaction({
      payload: {
        accountId: account1.id,
        securityId: aaplSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2024-02-01',
        quantity: '2',
        price: '200',
      },
    });

    // Account 1, VOO, Sell, Mar 1
    await createInvestmentTransaction({
      payload: {
        accountId: account1.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        date: '2024-03-01',
        quantity: '0.5',
        price: '110',
      },
    });

    // Account 2, VOO, Buy, Apr 1
    await createInvestmentTransaction({
      payload: {
        accountId: account2.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        date: '2024-04-01',
        quantity: '3',
        price: '105',
      },
    });

    // Test 1: Filter by account
    const accountFilterResponse = await getInvestmentTransactions({
      accountId: account1.id,
    });
    expect(accountFilterResponse.statusCode).toBe(200);
    const accountFilterData = extractResponse(accountFilterResponse);
    expect(accountFilterData.transactions).toHaveLength(3);
    expect(accountFilterData.transactions.every((tx) => tx.accountId === account1.id)).toBe(true);

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
      accountId: account1.id,
      securityId: vooSecurity.id,
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
    });
    expect(combinedFilterResponse.statusCode).toBe(200);
    const combinedFilterData = extractResponse(combinedFilterResponse);
    expect(combinedFilterData.transactions).toHaveLength(1);
    expect(combinedFilterData.transactions[0]!.accountId).toBe(account1.id);
    expect(combinedFilterData.transactions[0]!.securityId).toBe(vooSecurity.id);
    expect(combinedFilterData.transactions[0]!.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.buy);
  });

  it('should return 404 for non-existent account', async () => {
    const response = await getInvestmentTransactions({
      accountId: 999999,
    });
    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });
});
