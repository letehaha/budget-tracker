import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Holdings from '@models/investments/Holdings.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import * as helpers from '@tests/helpers';

describe('PUT /investments/transaction/:transactionId (update investment transaction)', () => {
  let portfolio: Portfolios;
  let investmentAccount: Accounts;
  let vooSecurity: Securities;
  let transaction: InvestmentTransaction;

  beforeEach(async () => {
    portfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({
        name: 'Test Investment Portfolio',
      }),
      raw: true,
    });

    // Create a temporary account for the holding (needed for backward compatibility)
    // Use USD currency if available, otherwise use the base currency
    const usdCurrency = global.MODELS_CURRENCIES.find((c: { code: string }) => c.code === 'USD');
    const currencyToUse = usdCurrency || global.BASE_CURRENCY;

    investmentAccount = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        accountCategory: ACCOUNT_CATEGORIES.investment,
        currencyId: currencyToUse.id,
      }),
      raw: true,
    });

    const seededSecurities: Securities[] = await helpers.seedSecuritiesViaSync([
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
    ]);
    vooSecurity = seededSecurities.find((s) => s.symbol === 'VOO')!;
    if (!vooSecurity) throw new Error('VOO security not found after seeding');

    // Create holding directly in the database with portfolioId since the service is still account-based
    await Holdings.create({
      portfolioId: portfolio.id,
      accountId: investmentAccount.id, // Required during transition period
      securityId: vooSecurity.id,
      quantity: '0',
      costBasis: '0',
      refCostBasis: '0',
      value: '0',
      refValue: '0',
      currencyCode: 'USD',
    });

    // Create a transaction to update
    transaction = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '2',
        price: '50',
        fees: '5',
      },
      raw: true,
    });
  });

  it('should update transaction quantity successfully', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        quantity: '3',
      },
      raw: true,
    });

    expect(response.quantity).toBeNumericEqual(3);
    expect(response.amount).toBeNumericEqual(150); // 3 * 50
    expect(response.price).toBeNumericEqual(50); // Should remain the same
    expect(response.fees).toBeNumericEqual(5); // Should remain the same
  });

  it('should update transaction price successfully', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        price: '60',
      },
      raw: true,
    });

    expect(response.price).toBeNumericEqual(60);
    expect(response.amount).toBeNumericEqual(120); // 2 * 60
    expect(response.quantity).toBeNumericEqual(2); // Should remain the same
    expect(response.fees).toBeNumericEqual(5); // Should remain the same
  });

  it('should update transaction category successfully', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
      },
      raw: true,
    });

    expect(response.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.sell);
    expect(response.transactionType).toBe('income'); // Should change from expense to income
  });

  it('should update multiple fields successfully', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        quantity: '4',
        price: '75',
        fees: '10',
        name: 'Updated transaction',
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
      },
      raw: true,
    });

    expect(response.quantity).toBeNumericEqual(4);
    expect(response.price).toBeNumericEqual(75);
    expect(response.fees).toBeNumericEqual(10);
    expect(response.amount).toBeNumericEqual(300); // 4 * 75
    expect(response.name).toBe('Updated transaction');
    expect(response.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.sell);
  });

  it('should recalculate holding after transaction update', async () => {
    // Get holding before update
    const holdingBefore = await Holdings.findOne({
      where: { accountId: investmentAccount.id, securityId: vooSecurity.id },
    });
    expect(holdingBefore).not.toBeNull();
    expect(holdingBefore!.quantity).toBeNumericEqual(2); // From the buy transaction
    expect(holdingBefore!.costBasis).toBeNumericEqual(105); // (2 * 50) + 5 fees

    // Update the transaction quantity
    await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        quantity: '5',
      },
      raw: true,
    });

    // Get holding after update
    const holdingAfter = await Holdings.findOne({
      where: { accountId: investmentAccount.id, securityId: vooSecurity.id },
    });
    expect(holdingAfter).not.toBeNull();
    expect(holdingAfter!.quantity).toBeNumericEqual(5); // Should be updated to 5
    expect(holdingAfter!.costBasis).toBeNumericEqual(255); // (5 * 50) + 5 fees
  });

  it('should handle updating date field', async () => {
    const newDate = '2023-01-15';
    const response = await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        date: newDate,
      },
      raw: true,
    });

    expect(response.date).toBe(newDate);
  });

  it('should fail to update non-existent transaction', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: 99999,
      payload: {
        quantity: '3',
      },
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should fail with invalid transaction ID', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: -1,
      payload: {
        quantity: '3',
      },
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should handle empty update payload', async () => {
    const response = await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {},
      raw: true,
    });

    // Should return the transaction unchanged
    expect(response.quantity).toBeNumericEqual(2);
    expect(response.price).toBeNumericEqual(50);
    expect(response.fees).toBeNumericEqual(5);
    expect(response.name).toBe(''); // Empty string since no name was provided during creation
  });

  it('should handle complex scenario with multiple transactions', async () => {
    // Create another buy transaction
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '3',
        price: '60',
        fees: '0',
      },
      raw: true,
    });

    // Verify holding before update
    const holdingBefore = await Holdings.findOne({
      where: { accountId: investmentAccount.id, securityId: vooSecurity.id },
    });
    expect(holdingBefore!.quantity).toBeNumericEqual(5); // 2 + 3

    // Update the first transaction
    await helpers.updateInvestmentTransaction({
      transactionId: transaction.id,
      payload: {
        quantity: '1', // Change from 2 to 1
      },
      raw: true,
    });

    // Verify holding after update - should be recalculated properly
    const holdingAfter = await Holdings.findOne({
      where: { accountId: investmentAccount.id, securityId: vooSecurity.id },
    });
    expect(holdingAfter!.quantity).toBeNumericEqual(4); // 1 + 3 (after first tx update)
  });
});
