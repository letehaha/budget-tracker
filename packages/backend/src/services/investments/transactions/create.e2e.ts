import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Holdings from '@models/investments/Holdings.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import * as helpers from '@tests/helpers';

describe('POST /transaction (create investment transaction)', () => {
  let investmentPortfolio: Portfolios;
  let investmentAccount: Accounts;
  let vooSecurity: Securities;

  beforeEach(async () => {
    investmentPortfolio = await helpers.createPortfolio({
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

    // Currencies are already seeded in setupIntegrationTests.ts

    const seededSecurities: Securities[] = await helpers.seedSecuritiesViaSync([
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
    ]);
    vooSecurity = seededSecurities.find((s) => s.symbol === 'VOO')!;
    if (!vooSecurity) throw new Error('VOO security not found after seeding');

    // Create holding directly in the database with portfolioId since the service is still account-based
    await Holdings.create({
      portfolioId: investmentPortfolio.id,
      accountId: investmentAccount.id, // Required during transition period
      securityId: vooSecurity.id,
      quantity: '0',
      costBasis: '0',
      refCostBasis: '0',
      value: '0',
      refValue: '0',
      currencyCode: 'USD',
    });
  });

  it('should create an investment transaction successfully', async () => {
    const payload = helpers.buildInvestmentTransactionPayload({
      portfolioId: investmentPortfolio.id,
      securityId: vooSecurity.id,
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
      quantity: '2',
      price: '50',
    });

    const response = await helpers.createInvestmentTransaction({ payload, raw: true });

    expect(response.portfolioId).toBe(investmentPortfolio.id);
    expect(response.securityId).toBe(vooSecurity.id);
    expect(response.category).toBe(INVESTMENT_TRANSACTION_CATEGORY.buy);
    expect(response.quantity).toBe('2.000000000000000000');
    expect(response.price).toBe('50.0000000000');
    expect(response.amount).toBe('100.0000000000');
  });

  it('fails if holding does not exist', async () => {
    // Create a different portfolio without any holdings
    const otherPortfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({
        name: 'Other Portfolio Without Holdings',
      }),
      raw: true,
    });

    // Try to create a transaction with the VOO security in the portfolio that has no holdings
    const payload = helpers.buildInvestmentTransactionPayload({
      portfolioId: otherPortfolio.id,
      securityId: vooSecurity.id,
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
      quantity: '1',
      price: '150',
    });

    const response = await helpers.createInvestmentTransaction({ payload, raw: false });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('fails if required fields are missing', async () => {
    // Create payload without required fields (quantity and price)
    const payload = {
      portfolioId: investmentPortfolio.id,
      securityId: vooSecurity.id,
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
      date: new Date().toISOString().slice(0, 10),
      fees: '0',
      name: '',
      // Missing quantity and price - these are required
    };

    // Use makeRequest directly to bypass helper type checking
    const response = await helpers.makeRequest({
      method: 'post',
      url: '/investments/transaction',
      payload,
      raw: false,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('correctly calculates amount as quantity * price', async () => {
    const payload = helpers.buildInvestmentTransactionPayload({
      portfolioId: investmentPortfolio.id,
      securityId: vooSecurity.id,
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
      quantity: '3',
      price: '75.50',
      fees: '5.00',
    });

    const response = await helpers.createInvestmentTransaction({ payload, raw: true });

    // amount = quantity * price = 3 * 75.50 = 226.50
    expect(response.amount).toBe('226.5000000000');
    expect(response.fees).toBe('5.0000000000');
  });
});
