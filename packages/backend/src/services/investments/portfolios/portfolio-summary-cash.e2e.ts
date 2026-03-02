import { beforeEach, describe, expect, it } from '@jest/globals';
import Portfolios from '@models/investments/Portfolios.model';
import * as helpers from '@tests/helpers';

describe('Portfolio Summary with Cash (GET /investments/portfolios/:id/summary)', () => {
  let portfolio: Portfolios;

  beforeEach(async () => {
    portfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Summary Test Portfolio' }),
      raw: true,
    });
  });

  it('should return zero cash values when portfolio has no cash', async () => {
    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    expect(summary.totalCashInBaseCurrency).toBe('0.00');
    expect(summary.availableCashInBaseCurrency).toBe('0.00');
    expect(summary.totalPortfolioValue).toBe('0.00');
  });

  it('should include cash in summary after depositing funds', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Cash Source' }),
      raw: true,
    });

    await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '5000',
        date: '2025-06-15',
      },
      raw: true,
    });

    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    // Cash should be reflected in the summary
    // The exact values depend on base currency conversion,
    // but they should be non-zero
    expect(parseFloat(summary.totalCashInBaseCurrency)).toBeGreaterThan(0);
    expect(parseFloat(summary.availableCashInBaseCurrency)).toBeGreaterThan(0);
    expect(parseFloat(summary.totalPortfolioValue)).toBeGreaterThan(0);
  });

  it('should aggregate multiple currency cash balances in summary', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'USD Source' }),
      raw: true,
    });

    // Deposit USD
    await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '3000',
        date: '2025-06-15',
      },
      raw: true,
    });

    // Create EUR account and deposit EUR
    const { account: eurAccount } = await helpers.createAccountWithNewCurrency({ currency: 'EUR' });

    await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: eurAccount.id,
        amount: '2000',
        date: '2025-06-15',
      },
      raw: true,
    });

    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    // Both currency amounts should be included in the total cash
    // (converted to base currency). The exact value depends on exchange rates,
    // but it should be greater than either individual deposit.
    expect(parseFloat(summary.totalCashInBaseCurrency)).toBeGreaterThan(0);
    expect(parseFloat(summary.totalPortfolioValue)).toBeGreaterThan(0);

    // Total cash should include both currencies (each converted to base)
    // so it should exceed the USD deposit alone
    expect(parseFloat(summary.totalCashInBaseCurrency)).toBeGreaterThan(3000);
  });

  it('should include cash in totalPortfolioValue', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Cash Source' }),
      raw: true,
    });

    await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '2000',
        date: '2025-06-15',
      },
      raw: true,
    });

    const summary = await helpers.getPortfolioSummary({
      portfolioId: portfolio.id,
      raw: true,
    });

    // Without any holdings, totalPortfolioValue = cash only
    expect(summary.totalCurrentValue).toBe('0.00');
    expect(parseFloat(summary.totalPortfolioValue)).toEqual(parseFloat(summary.totalCashInBaseCurrency));
  });
});
