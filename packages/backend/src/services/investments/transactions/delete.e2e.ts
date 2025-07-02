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

describe('DELETE /investments/transaction/:transactionId (delete investment transaction)', () => {
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

    // Create a transaction to delete
    transaction = await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '2',
        price: '50',
      },
      raw: true,
    });
  });

  it('should delete an investment transaction successfully', async () => {
    const response = await helpers.deleteInvestmentTransaction({
      transactionId: transaction.id,
      raw: false,
    });

    expect(response.statusCode).toBe(200);

    // Verify transaction is deleted
    const deletedTransaction = await InvestmentTransaction.findByPk(transaction.id);
    expect(deletedTransaction).toBeNull();
  });

  it('should recalculate holding after transaction deletion', async () => {
    // Get holding before deletion
    const holdingBefore = await Holdings.findOne({
      where: { portfolioId: portfolio.id, securityId: vooSecurity.id },
    });
    expect(holdingBefore).not.toBeNull();
    expect(holdingBefore!.quantity).toBeNumericEqual(2); // From the buy transaction
    expect(holdingBefore!.costBasis).toBeNumericEqual(100); // 2 * 50

    // Delete the transaction
    await helpers.deleteInvestmentTransaction({
      transactionId: transaction.id,
      raw: false,
    });

    // Get holding after deletion
    const holdingAfter = await Holdings.findOne({
      where: { portfolioId: portfolio.id, securityId: vooSecurity.id },
    });
    expect(holdingAfter).not.toBeNull();
    expect(holdingAfter!.quantity).toBeNumericEqual(0); // Should be 0 after deletion
    expect(holdingAfter!.costBasis).toBeNumericEqual(0); // Should be 0 after deletion
  });

  it('should handle deleting a transaction that affects multiple transactions', async () => {
    // Create another buy transaction
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.buy,
        quantity: '3',
        price: '60',
      },
      raw: true,
    });

    // Create a sell transaction
    await helpers.createInvestmentTransaction({
      payload: {
        portfolioId: portfolio.id,
        securityId: vooSecurity.id,
        category: INVESTMENT_TRANSACTION_CATEGORY.sell,
        quantity: '1',
        price: '70',
      },
      raw: true,
    });

    // Verify holding before deletion
    const holdingBefore = await Holdings.findOne({
      where: { portfolioId: portfolio.id, securityId: vooSecurity.id },
    });
    expect(holdingBefore!.quantity).toBeNumericEqual(4); // 2 + 3 - 1

    // Delete the first buy transaction
    await helpers.deleteInvestmentTransaction({
      transactionId: transaction.id,
      raw: false,
    });

    // Verify holding after deletion - should be recalculated properly
    const holdingAfter = await Holdings.findOne({
      where: { portfolioId: portfolio.id, securityId: vooSecurity.id },
    });
    expect(holdingAfter!.quantity).toBeNumericEqual(2); // 3 - 1 (first buy deleted)
  });

  it('should successfully delete non-existent transaction', async () => {
    const response = await helpers.deleteInvestmentTransaction({
      transactionId: 99999,
      raw: false,
    });

    expect(response.statusCode).toBe(200);
  });

  it('should fail with invalid transaction ID', async () => {
    const response = await helpers.deleteInvestmentTransaction({
      transactionId: -1,
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});
