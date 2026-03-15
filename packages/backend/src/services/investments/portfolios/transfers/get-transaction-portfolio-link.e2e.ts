import { TRANSACTION_TYPES } from '@bt/shared/types';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/accounts.model';
import Portfolios from '@models/investments/portfolios.model';
import * as helpers from '@tests/helpers';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Get Transaction Portfolio Link (GET /transactions/:transactionId/portfolio-link)', () => {
  let portfolio: Portfolios;
  let account: Accounts;

  beforeEach(async () => {
    portfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Investment Portfolio' }),
      raw: true,
    });

    account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Main Account' }),
      raw: true,
    });
  });

  it('should return link info for an expense transaction linked as deposit', async () => {
    const [expenseTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    await helpers.linkTransactionToPortfolio({
      transactionId: expenseTx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    const link = await helpers.getTransactionPortfolioLink({
      transactionId: expenseTx!.id,
      raw: true,
    });

    expect(link).toMatchObject({
      transferId: expect.any(Number),
      portfolioId: portfolio.id,
      portfolioName: 'Investment Portfolio',
      transferType: 'deposit',
      amount: expect.toBeNumericEqual('500'),
      currencyCode: account.currencyCode,
      date: expect.any(String),
    });
  });

  it('should return link info for an income transaction linked as withdrawal', async () => {
    const [incomeTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 300,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    await helpers.linkTransactionToPortfolio({
      transactionId: incomeTx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    const link = await helpers.getTransactionPortfolioLink({
      transactionId: incomeTx!.id,
      raw: true,
    });

    expect(link).toMatchObject({
      transferId: expect.any(Number),
      portfolioId: portfolio.id,
      portfolioName: 'Investment Portfolio',
      transferType: 'withdrawal',
      amount: expect.toBeNumericEqual('300'),
      currencyCode: account.currencyCode,
      date: expect.any(String),
    });
  });

  it('should return 404 for an unlinked transaction', async () => {
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const result = await helpers.getTransactionPortfolioLink({
      transactionId: tx!.id,
    });

    expect(result.statusCode).toBe(ERROR_CODES.NotFoundError);
  });
});
