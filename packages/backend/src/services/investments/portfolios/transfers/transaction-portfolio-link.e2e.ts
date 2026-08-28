import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/accounts.model';
import Portfolios from '@models/investments/portfolios.model';
import * as helpers from '@tests/helpers';

describe('Transaction ↔ Portfolio link (/transactions/:transactionId/*-portfolio)', () => {
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

  describe('Link', () => {
    it('should link an expense transaction to a portfolio (account → portfolio deposit) and list the transfer', async () => {
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
        id: expect.any(String),
        fromAccountId: account.id,
        toPortfolioId: portfolio.id,
        fromPortfolioId: null,
        toAccountId: null,
        amount: expect.toBeNumericEqual('500'),
        refAmount: expect.any(String),
        currencyCode,
        transactionId: expenseTx!.id,
      });

      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });

      expect(balance!.availableCash).toBeNumericEqual(500);
      expect(balance!.totalCash).toBeNumericEqual(500);

      const transactions = await helpers.getTransactions({ raw: true });
      const updatedTx = transactions.find((t) => t.id === expenseTx!.id);
      expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);
      expect(updatedTx!.refCurrencyCode).toBe(global.BASE_CURRENCY.code);

      const { data: transfers } = await helpers.listPortfolioTransfers({
        portfolioId: portfolio.id,
        raw: true,
      });

      expect(transfers.length).toBe(1);
      expect(transfers[0]!.id).toBe(transfer.id);
    }, 30000);

    it('should link an income transaction to a portfolio (portfolio → account withdrawal)', async () => {
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
        id: expect.any(String),
        fromPortfolioId: portfolio.id,
        toAccountId: account.id,
        fromAccountId: null,
        toPortfolioId: null,
        amount: expect.toBeNumericEqual('300'),
        transactionId: incomeTx!.id,
      });

      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });

      expect(balance!.availableCash).toBeNumericEqual(700);
      expect(balance!.totalCash).toBeNumericEqual(700);

      const transactions = await helpers.getTransactions({ raw: true });
      const updatedTx = transactions.find((t) => t.id === incomeTx!.id);
      expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);
      expect(updatedTx!.refCurrencyCode).toBe(global.BASE_CURRENCY.code);
    });

    it('should stamp base currency on refCurrencyCode when account currency differs', async () => {
      const { account: eurAccount } = await helpers.createAccountWithNewCurrency({ currency: 'EUR' });

      const [eurExpenseTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: eurAccount.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      await helpers.linkTransactionToPortfolio({
        transactionId: eurExpenseTx!.id,
        payload: { portfolioId: portfolio.id },
        raw: true,
      });

      // The underlying transaction must record the user's base currency (NOT EUR) in
      // refCurrencyCode. A regression that re-uses account.currencyCode would silently
      // pass any same-currency test, so this assertion is the load-bearing one.
      const transactions = await helpers.getTransactions({ raw: true });
      const updatedTx = transactions.find((t) => t.id === eurExpenseTx!.id);
      expect(updatedTx!.currencyCode).toBe('EUR');
      expect(updatedTx!.refCurrencyCode).toBe(global.BASE_CURRENCY.code);
      expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);
    });

    it('should return 404 for non-existent transaction', async () => {
      const response = await helpers.linkTransactionToPortfolio({
        transactionId: generateRandomRecordId(),
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
        payload: { portfolioId: generateRandomRecordId() },
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

      await helpers.linkTransactionToPortfolio({
        transactionId: tx!.id,
        payload: { portfolioId: portfolio.id },
        raw: true,
      });

      const response = await helpers.linkTransactionToPortfolio({
        transactionId: tx!.id,
        payload: { portfolioId: portfolio.id },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should reject linking a transaction with common_transfer nature', async () => {
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

    it('should link a transfer_out_wallet transaction and restore that nature when it is unlinked', async () => {
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

      const linkedTransactions = await helpers.getTransactions({ raw: true });
      const linkedTx = linkedTransactions.find((t) => t.id === tx!.id);
      expect(linkedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);

      await helpers.unlinkTransactionFromPortfolio({
        transactionId: tx!.id,
        raw: true,
      });

      // Restored to its original transfer_out_wallet, not not_transfer
      const unlinkedTransactions = await helpers.getTransactions({ raw: true });
      const unlinkedTx = unlinkedTransactions.find((t) => t.id === tx!.id);
      expect(unlinkedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
    }, 30000);

    it('should restore original transferNature when deleting the portfolio transfer (keep tx)', async () => {
      const [expenseTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const transfer = await helpers.linkTransactionToPortfolio({
        transactionId: expenseTx!.id,
        payload: { portfolioId: portfolio.id },
        raw: true,
      });

      let transactions = await helpers.getTransactions({ raw: true });
      let updatedTx = transactions.find((t) => t.id === expenseTx!.id);
      expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);

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
  });

  describe('Unlink', () => {
    it('should unlink an expense transaction — portfolio balance reversed, tx still exists', async () => {
      const [expenseTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 400,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      await helpers.linkTransactionToPortfolio({
        transactionId: expenseTx!.id,
        payload: { portfolioId: portfolio.id },
        raw: true,
      });

      const [balanceBefore] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceBefore!.availableCash).toBeNumericEqual(400);

      await helpers.unlinkTransactionFromPortfolio({
        transactionId: expenseTx!.id,
        raw: true,
      });

      const [balanceAfter] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceAfter!.availableCash).toBeNumericEqual(0);
      expect(balanceAfter!.totalCash).toBeNumericEqual(0);

      const transactions = await helpers.getTransactions({ raw: true });
      const updatedTx = transactions.find((t) => t.id === expenseTx!.id);
      expect(updatedTx).toBeDefined();
      expect(updatedTx!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
    });

    it('should unlink an income transaction — portfolio balance reversed', async () => {
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

      const [balanceAfter] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceAfter!.availableCash).toBeNumericEqual(1000);
      expect(balanceAfter!.totalCash).toBeNumericEqual(1000);

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

      await helpers.linkTransactionToPortfolio({
        transactionId: tx!.id,
        payload: { portfolioId: portfolio.id },
        raw: true,
      });

      await helpers.unlinkTransactionFromPortfolio({
        transactionId: tx!.id,
        raw: true,
      });

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
        id: expect.any(String),
        fromAccountId: account.id,
        toPortfolioId: portfolio2.id,
      });

      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: portfolio2.id,
        currencyCode,
        raw: true,
      });
      expect(balance!.availableCash).toBeNumericEqual(250);
    });
  });

  describe('Get link', () => {
    it('should return link info for an expense transaction linked as deposit and an income transaction linked as withdrawal', async () => {
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

      const depositLink = await helpers.getTransactionPortfolioLink({
        transactionId: expenseTx!.id,
        raw: true,
      });

      expect(depositLink).toMatchObject({
        transferId: expect.any(String),
        portfolioId: portfolio.id,
        portfolioName: 'Investment Portfolio',
        isPortfolioDeleted: false,
        transferType: 'deposit',
        amount: expect.toBeNumericEqual('500'),
        currencyCode,
        date: expect.any(String),
      });

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

      const withdrawalLink = await helpers.getTransactionPortfolioLink({
        transactionId: incomeTx!.id,
        raw: true,
      });

      expect(withdrawalLink).toMatchObject({
        transferId: expect.any(String),
        portfolioId: portfolio.id,
        portfolioName: 'Investment Portfolio',
        isPortfolioDeleted: false,
        transferType: 'withdrawal',
        amount: expect.toBeNumericEqual('300'),
        currencyCode,
        date: expect.any(String),
      });
    }, 30000);

    it('should still surface link with isPortfolioDeleted=true after the portfolio is soft-deleted', async () => {
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

      await helpers.deletePortfolio({ portfolioId: portfolio.id });

      const link = await helpers.getTransactionPortfolioLink({
        transactionId: expenseTx!.id,
        raw: true,
      });

      expect(link).toMatchObject({
        portfolioId: portfolio.id,
        portfolioName: 'Investment Portfolio',
        isPortfolioDeleted: true,
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
});
