import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Portfolios from '@models/investments/Portfolios.model';
import * as helpers from '@tests/helpers';

describe('Account to Portfolio Transfer (POST /investments/portfolios/:id/transfer/from-account)', () => {
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

  it('should transfer funds from account to portfolio', async () => {
    const transferAmount = '500';
    const transfer = await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: transferAmount,
        date: '2025-06-15',
        description: 'Deposit to portfolio',
      },
      raw: true,
    });

    expect(transfer).toMatchObject({
      id: expect.any(Number),
      fromAccountId: account.id,
      toPortfolioId: portfolio.id,
      fromPortfolioId: null,
      toAccountId: null,
      amount: expect.toBeNumericEqual(transferAmount),
      refAmount: expect.any(String),
      currencyCode,
      description: 'Deposit to portfolio',
    });

    // Verify portfolio cash balance increased
    const [balance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });

    expect(balance!.availableCash).toBeNumericEqual(500);
    expect(balance!.totalCash).toBeNumericEqual(500);
  });

  it('should create an expense transaction on the account', async () => {
    const transfer = await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '200',
        date: '2025-06-15',
      },
      raw: true,
    });

    // Check that an expense transaction was created on the account
    const transactions = await helpers.getTransactions({
      raw: true,
    });

    expect(transactions.length).toBe(1);

    const tx = transactions[0]!;
    expect(tx.transactionType).toBe(TRANSACTION_TYPES.expense);
    expect(tx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);
    expect(tx.amount).toBeNumericEqual(200);

    // Verify the PortfolioTransfer record points to the transaction
    expect(transfer.transactionId).toBe(tx.id);
  });

  it('should handle multiple transfers accumulating balance', async () => {
    await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '300',
        date: '2025-06-10',
      },
      raw: true,
    });

    await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '200',
        date: '2025-06-15',
      },
      raw: true,
    });

    const [balance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });

    expect(balance!.availableCash).toBeNumericEqual(500);
    expect(balance!.totalCash).toBeNumericEqual(500);
  });

  it('should appear in portfolio transfer list', async () => {
    const transfer = await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '100',
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

  it('should reject zero amount', async () => {
    const response = await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '0',
        date: '2025-06-15',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject negative amount', async () => {
    const response = await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '-100',
        date: '2025-06-15',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject non-existent portfolio', async () => {
    const response = await helpers.accountToPortfolioTransfer({
      portfolioId: 999999,
      payload: {
        accountId: account.id,
        amount: '100',
        date: '2025-06-15',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should reject non-existent account', async () => {
    const response = await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: 999999,
        amount: '100',
        date: '2025-06-15',
      },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should deposit in account currency when account and base currency differ', async () => {
    const { account: eurAccount } = await helpers.createAccountWithNewCurrency({ currency: 'EUR' });

    const transfer = await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: eurAccount.id,
        amount: '300',
        date: '2025-06-15',
      },
      raw: true,
    });

    // Transfer should use the account's currency (EUR)
    expect(transfer.currencyCode).toBe('EUR');

    // Portfolio should have a EUR balance, not the base currency
    const [eurBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: 'EUR',
      raw: true,
    });
    expect(eurBalance!.availableCash).toBeNumericEqual(300);
    expect(eurBalance!.totalCash).toBeNumericEqual(300);
  });

  it('should allow transfer exceeding account balance (soft tracking)', async () => {
    // Account starts with initialBalance=0, try to transfer more
    const transfer = await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '50000',
        date: '2025-06-15',
      },
      raw: true,
    });

    expect(transfer.id).toEqual(expect.any(Number));

    // Portfolio should still receive the funds
    const [balance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode,
      raw: true,
    });
    expect(balance!.availableCash).toBeNumericEqual(50000);
  });

  it('should not change total wealth when transferring from account to portfolio', async () => {
    // Create account with initial balance so we have measurable wealth
    const richAccount = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Rich Account', initialBalance: 10000 }),
      raw: true,
    });

    // Before transfer: account has 10000, portfolio has 0 in this currency
    const accountBefore = await helpers.getAccount({ id: richAccount.id, raw: true });
    const totalBefore = Number(accountBefore.currentBalance);

    // Transfer 3000 from account to portfolio
    await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: richAccount.id,
        amount: '3000',
        date: '2025-06-15',
      },
      raw: true,
    });

    // After transfer: account should have 7000, portfolio should have 3000
    const accountAfter = await helpers.getAccount({ id: richAccount.id, raw: true });
    const [portfolioBalance] = await helpers.getPortfolioBalance({
      portfolioId: portfolio.id,
      currencyCode: richAccount.currencyCode,
      raw: true,
    });

    const totalAfter = Number(accountAfter.currentBalance) + Number(portfolioBalance!.availableCash);

    // Total wealth should remain unchanged (money just changed placement)
    expect(totalAfter).toBeNumericEqual(totalBefore);
  });

  it('should reject invalid date format', async () => {
    const response = await helpers.accountToPortfolioTransfer({
      portfolioId: portfolio.id,
      payload: {
        accountId: account.id,
        amount: '100',
        date: 'not-a-date',
      },
    });

    // Should fail with a server error since the date cannot be parsed
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
