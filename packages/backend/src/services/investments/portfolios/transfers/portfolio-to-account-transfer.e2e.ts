import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Portfolios from '@models/investments/Portfolios.model';
import * as helpers from '@tests/helpers';

describe('Portfolio to Account Transfer (POST /investments/portfolios/:id/transfer/to-account)', () => {
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

    // Seed portfolio with some cash so withdrawal makes sense
    await helpers.updatePortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      setAvailableCash: '1000',
      setTotalCash: '1000',
    });
  });

  it('should transfer funds from portfolio to account (new transaction)', async () => {
    const transfer = await helpers.portfolioToAccountTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '300',
        currencyCode,
        date: '2025-06-15',
        description: 'Withdraw from portfolio',
      },
      raw: true,
    });

    expect(transfer).toMatchObject({
      id: expect.any(Number),
      fromPortfolioId: portfolio.id,
      toAccountId: account.id,
      fromAccountId: null,
      toPortfolioId: null,
      amount: expect.toBeNumericEqual('300'),
      refAmount: expect.any(String),
      currencyCode,
      description: 'Withdraw from portfolio',
    });

    // Portfolio balance should decrease
    const [balance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });

    expect(balance!.availableCash).toBeNumericEqual(700);
    expect(balance!.totalCash).toBeNumericEqual(700);
  });

  it('should create an income transaction on the account', async () => {
    const transfer = await helpers.portfolioToAccountTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '200',
        currencyCode,
        date: '2025-06-15',
      },
      raw: true,
    });

    const transactions = await helpers.getTransactions({
      raw: true,
    });

    expect(transactions.length).toBe(1);

    const tx = transactions[0]!;
    expect(tx.transactionType).toBe(TRANSACTION_TYPES.income);
    expect(tx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);
    expect(tx.amount).toBeNumericEqual(200);

    // Verify the PortfolioTransfer record points to the transaction
    expect(transfer.transactionId).toBe(tx.id);
  });

  it('should link an existing income transaction instead of creating one', async () => {
    // First create an income transaction manually
    const [incomeTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    // Now create a portfolio→account transfer linking to that transaction
    const transfer = await helpers.portfolioToAccountTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '500',
        currencyCode,
        date: '2025-06-15',
        existingTransactionId: incomeTx!.id,
      },
      raw: true,
    });

    expect(transfer.id).toEqual(expect.any(Number));

    // Verify the existing transaction was updated (not a new one created)
    const transactions = await helpers.getTransactions({
      raw: true,
    });

    // Should still be only 1 transaction (the existing one, now linked)
    expect(transactions.length).toBe(1);
    expect(transactions[0]!.id).toBe(incomeTx!.id);
    expect(transactions[0]!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);

    // Verify the PortfolioTransfer record points to the existing transaction
    expect(transfer.transactionId).toBe(incomeTx!.id);
  });

  it('should reject linking a non-income transaction', async () => {
    const [expenseTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const response = await helpers.portfolioToAccountTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '500',
        currencyCode,
        date: '2025-06-15',
        existingTransactionId: expenseTx!.id,
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject linking a transaction already linked to another transfer', async () => {
    const [incomeTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    // Link it once
    await helpers.portfolioToAccountTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '500',
        currencyCode,
        date: '2025-06-15',
        existingTransactionId: incomeTx!.id,
      },
      raw: true,
    });

    // Try to link the same transaction again
    const response = await helpers.portfolioToAccountTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '500',
        currencyCode,
        date: '2025-06-20',
        existingTransactionId: incomeTx!.id,
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should allow portfolio balance to go negative (soft tracking)', async () => {
    // Withdraw more than available (1000 in portfolio)
    const transfer = await helpers.portfolioToAccountTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '1500',
        currencyCode,
        date: '2025-06-15',
      },
      raw: true,
    });

    expect(transfer.id).toEqual(expect.any(Number));

    const [balance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });

    expect(balance!.availableCash).toBeNumericEqual(-500);
    expect(balance!.totalCash).toBeNumericEqual(-500);
  });

  it('should reject zero amount', async () => {
    const response = await helpers.portfolioToAccountTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '0',
        currencyCode,
        date: '2025-06-15',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject non-existent portfolio', async () => {
    const response = await helpers.portfolioToAccountTransfer({
      portfolioId: 999999,
      payload: {
        accountId: account.id,
        amount: '100',
        currencyCode,
        date: '2025-06-15',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should reject non-existent account', async () => {
    const response = await helpers.portfolioToAccountTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: 999999,
        amount: '100',
        currencyCode,
        date: '2025-06-15',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should appear in portfolio transfer list', async () => {
    const transfer = await helpers.portfolioToAccountTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '100',
        currencyCode,
        date: '2025-06-15',
      },
      raw: true,
    });

    const { data: transfers } = await helpers.listPortfolioTransfers({
      portfolioId: portfolio.id,
      raw: true,
    });

    expect(transfers.length).toBe(1);
    expect(transfers[0]!.id).toBe(transfer.id);
  });

  it('should not change total wealth when transferring from portfolio to account', async () => {
    // Portfolio starts with 1000 cash (from beforeEach), account starts with 0
    const accountBefore = await helpers.getAccount({ id: account.id, raw: true });
    const [portfolioBalanceBefore] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });

    const totalBefore = Number(accountBefore.currentBalance) + Number(portfolioBalanceBefore!.availableCash);

    // Transfer 400 from portfolio to account
    await helpers.portfolioToAccountTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '400',
        currencyCode,
        date: '2025-06-15',
      },
      raw: true,
    });

    // After transfer: portfolio should have 600, account should have +400
    const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
    const [portfolioBalanceAfter] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });

    const totalAfter = Number(accountAfter.currentBalance) + Number(portfolioBalanceAfter!.availableCash);

    // Total wealth should remain unchanged (money just changed placement)
    expect(totalAfter).toBeNumericEqual(totalBefore);
  });
});
