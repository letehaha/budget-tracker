import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/accounts.model';
import Portfolios from '@models/investments/portfolios.model';
import * as helpers from '@tests/helpers';

describe('Link Transaction to Portfolio (POST /transactions/:transactionId/link-to-portfolio)', () => {
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

  it('should link an expense transaction to a portfolio (account → portfolio deposit)', async () => {
    const [expenseTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const transfer = await helpers.linkTransactionToPortfolio({
      transactionId: expenseTx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    expect(transfer).toMatchObject({
      id: expect.any(Number),
      fromAccountId: account.id,
      toPortfolioId: portfolio.id,
      fromPortfolioId: null,
      toAccountId: null,
      amount: expect.toBeNumericEqual('500'),
      refAmount: expect.any(String),
      currencyCode,
      transactionId: expenseTx!.id,
    });

    // Portfolio balance should increase
    const [balance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });

    expect(balance!.availableCash).toBeNumericEqual(500);
    expect(balance!.totalCash).toBeNumericEqual(500);

    // Transaction should be marked as transfer_to_portfolio
    const transactions = await helpers.getTransactions({ raw: true });
    const updatedTx = transactions.find((t) => t.id === expenseTx!.id);
    expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);
  });

  it('should link an income transaction to a portfolio (portfolio → account withdrawal)', async () => {
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

    const transfer = await helpers.linkTransactionToPortfolio({
      transactionId: incomeTx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    expect(transfer).toMatchObject({
      id: expect.any(Number),
      fromPortfolioId: portfolio.id,
      toAccountId: account.id,
      fromAccountId: null,
      toPortfolioId: null,
      amount: expect.toBeNumericEqual('300'),
      transactionId: incomeTx!.id,
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

  it('should return 404 for non-existent transaction', async () => {
    const response = await helpers.linkTransactionToPortfolio({
      transactionId: 999999,
      payload: { portfolioId: portfolio.id },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should return 404 for non-existent portfolio', async () => {
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
      }),
      raw: true,
    });

    const response = await helpers.linkTransactionToPortfolio({
      transactionId: tx!.id,
      payload: { portfolioId: 999999 },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should reject linking a transaction already linked to a portfolio', async () => {
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 200,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    // Link once
    await helpers.linkTransactionToPortfolio({
      transactionId: tx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    // Try to link again
    const response = await helpers.linkTransactionToPortfolio({
      transactionId: tx!.id,
      payload: { portfolioId: portfolio.id },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject linking a transaction with common_transfer nature', async () => {
    // Create two accounts and link them as a regular transfer
    const account2 = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Second Account' }),
      raw: true,
    });

    const [baseTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: 100,
        destinationAccountId: account2.id,
      }),
      raw: true,
    });

    const response = await helpers.linkTransactionToPortfolio({
      transactionId: baseTx!.id,
      payload: { portfolioId: portfolio.id },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should allow linking a transfer_out_wallet transaction to a portfolio', async () => {
    // Create a transfer_out_wallet transaction (e.g. leftover from a deleted transfer)
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      }),
      raw: true,
    });

    const transfer = await helpers.linkTransactionToPortfolio({
      transactionId: tx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    expect(transfer).toMatchObject({
      fromAccountId: account.id,
      toPortfolioId: portfolio.id,
      transactionId: tx!.id,
    });

    // Transaction should now be transfer_to_portfolio
    const transactions = await helpers.getTransactions({ raw: true });
    const updatedTx = transactions.find((t) => t.id === tx!.id);
    expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);
  });

  it('should restore transfer_out_wallet when unlinking a previously out_of_wallet tx', async () => {
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      }),
      raw: true,
    });

    await helpers.linkTransactionToPortfolio({
      transactionId: tx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    // Unlink it
    await helpers.unlinkTransactionFromPortfolio({
      transactionId: tx!.id,
      raw: true,
    });

    // Should be restored to its original transfer_out_wallet, not not_transfer
    const transactions = await helpers.getTransactions({ raw: true });
    const updatedTx = transactions.find((t) => t.id === tx!.id);
    expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
  });

  it('should restore original transferNature when deleting the portfolio transfer (keep tx)', async () => {
    const [expenseTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 250,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    // Link it
    const transfer = await helpers.linkTransactionToPortfolio({
      transactionId: expenseTx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    // Transaction should now be transfer_to_portfolio
    let transactions = await helpers.getTransactions({ raw: true });
    let updatedTx = transactions.find((t) => t.id === expenseTx!.id);
    expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);

    // Delete the transfer but keep the transaction
    await helpers.deletePortfolioTransfer({
      portfolioId: portfolio.id,
      transferId: transfer.id,
      deleteLinkedTransaction: false,
      raw: true,
    });

    // Transaction should be restored to not_transfer (original state), NOT transfer_out_wallet
    transactions = await helpers.getTransactions({ raw: true });
    updatedTx = transactions.find((t) => t.id === expenseTx!.id);
    expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
  });

  it('should restore original transferNature when unlinking a transaction from portfolio', async () => {
    const [expenseTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 150,
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

    // Unlink it
    await helpers.unlinkTransactionFromPortfolio({
      transactionId: expenseTx!.id,
      raw: true,
    });

    // Transaction should be restored to not_transfer
    const transactions = await helpers.getTransactions({ raw: true });
    const updatedTx = transactions.find((t) => t.id === expenseTx!.id);
    expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
  });

  it('should show linked transfer in portfolio transfer list', async () => {
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 150,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const transfer = await helpers.linkTransactionToPortfolio({
      transactionId: tx!.id,
      payload: { portfolioId: portfolio.id },
      raw: true,
    });

    const { data: transfers } = await helpers.listPortfolioTransfers({
      portfolioId: portfolio.id,
      raw: true,
    });

    expect(transfers.length).toBe(1);
    expect(transfers[0]!.id).toBe(transfer.id);
  });
});
