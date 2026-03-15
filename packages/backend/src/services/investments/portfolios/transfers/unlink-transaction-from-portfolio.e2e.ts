import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import Accounts from '@models/Accounts.model';
import Portfolios from '@models/investments/Portfolios.model';
import * as helpers from '@tests/helpers';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Unlink Transaction from Portfolio (POST /transactions/:transactionId/unlink-from-portfolio)', () => {
  let portfolio: Portfolios;
  let account: Accounts;
  let currencyCode: string;

  beforeEach(async () => {
    portfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Investment Portfolio' }),
      raw: true,
    });

    account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Main Account' }),
      raw: true,
    });

    currencyCode = account.currencyCode;
  });

  it('should unlink an expense transaction — portfolio balance reversed, tx still exists', async () => {
    const [expenseTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    // Link it
    await helpers.linkTransactionToPortfolio({
      transactionId: expenseTx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    // Verify portfolio balance went up
    const [balanceBefore] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });
    expect(balanceBefore!.availableCash).toBeNumericEqual(400);

    // Unlink it
    await helpers.unlinkTransactionFromPortfolio({
      transactionId: expenseTx!.id,
      raw: true,
    });

    // Portfolio balance should be back to 0
    const [balanceAfter] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });
    expect(balanceAfter!.availableCash).toBeNumericEqual(0);
    expect(balanceAfter!.totalCash).toBeNumericEqual(0);

    // Transaction should still exist with not_transfer nature
    const transactions = await helpers.getTransactions({ raw: true });
    const updatedTx = transactions.find((t) => t.id === expenseTx!.id);
    expect(updatedTx).toBeDefined();
    expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
  });

  it('should unlink an income transaction — portfolio balance reversed', async () => {
    // Seed portfolio with some cash
    await helpers.updatePortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      setAvailableCash: '1000',
      setTotalCash: '1000',
    });

    const [incomeTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 300,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    // Link it (portfolio should go from 1000 to 700)
    await helpers.linkTransactionToPortfolio({
      transactionId: incomeTx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    const [balanceBefore] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });
    expect(balanceBefore!.availableCash).toBeNumericEqual(700);

    // Unlink it
    await helpers.unlinkTransactionFromPortfolio({
      transactionId: incomeTx!.id,
      raw: true,
    });

    // Portfolio balance should be back to 1000
    const [balanceAfter] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });
    expect(balanceAfter!.availableCash).toBeNumericEqual(1000);
    expect(balanceAfter!.totalCash).toBeNumericEqual(1000);

    // Transaction should still exist
    const transactions = await helpers.getTransactions({ raw: true });
    const updatedTx = transactions.find((t) => t.id === incomeTx!.id);
    expect(updatedTx).toBeDefined();
    expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
  });

  it('should be idempotent — unlinking a non-linked transaction succeeds', async () => {
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
      }),
      raw: true,
    });

    const response = await helpers.unlinkTransactionFromPortfolio({
      transactionId: tx!.id,
    });

    expect(response.statusCode).toBe(204);
  });

  it('should allow re-linking after unlinking', async () => {
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 250,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    // Link
    await helpers.linkTransactionToPortfolio({
      transactionId: tx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    // Unlink
    await helpers.unlinkTransactionFromPortfolio({
      transactionId: tx!.id,
      raw: true,
    });

    // Re-link to a different portfolio
    const portfolio2 = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Second Portfolio' }),
      raw: true,
    });

    const transfer = await helpers.linkTransactionToPortfolio({
      transactionId: tx!.id,
      payload: { portfolioId: portfolio2.id },
      raw: true,
    });

    expect(transfer).toMatchObject({
      id: expect.any(Number),
      fromAccountId: account.id,
      toPortfolioId: portfolio2.id,
    });

    // New portfolio should have the balance
    const [balance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio2.id,
      currencyCode,
      raw: true,
    });
    expect(balance!.availableCash).toBeNumericEqual(250);
  });
});
