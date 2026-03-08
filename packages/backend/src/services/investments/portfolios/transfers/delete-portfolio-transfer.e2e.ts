import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Accounts from '@models/Accounts.model';
import Portfolios from '@models/investments/Portfolios.model';
import * as helpers from '@tests/helpers';

describe('Delete Portfolio Transfer (DELETE /investments/portfolios/:id/transfers/:transferId)', () => {
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

  describe('account-to-portfolio transfer deletion', () => {
    it('should reverse portfolio balance when deleting account→portfolio transfer', async () => {
      const transfer = await helpers.accountToPortfolioTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: account.id,
          amount: '500',
          date: '2025-06-15',
        },
        raw: true,
      });

      // Verify balance was set
      const [balanceBefore] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceBefore!.availableCash).toBeNumericEqual(500);

      // Delete the transfer
      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        raw: true,
      });

      // Verify balance is back to 0
      const balancesAfter = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });

      // Balance record might be 0 or might not exist anymore
      if (balancesAfter.length > 0) {
        expect(balancesAfter[0]!.availableCash).toBeNumericEqual(0);
        expect(balancesAfter[0]!.totalCash).toBeNumericEqual(0);
      }
    });

    it('should keep account transaction and mark as out-of-wallet by default', async () => {
      const transfer = await helpers.accountToPortfolioTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: account.id,
          amount: '500',
          date: '2025-06-15',
        },
        raw: true,
      });

      // Delete the transfer (default: keep linked transaction)
      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        raw: true,
      });

      // The account transaction should still exist but marked as out_of_wallet
      const transactions = await helpers.getTransactions({ raw: true });

      expect(transactions.length).toBe(1);
      expect(transactions[0]!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
    });

    it('should delete linked account transaction when deleteLinkedTransaction=true', async () => {
      const transfer = await helpers.accountToPortfolioTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: account.id,
          amount: '500',
          date: '2025-06-15',
        },
        raw: true,
      });

      // Delete the transfer AND the linked transaction
      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        deleteLinkedTransaction: true,
        raw: true,
      });

      // The account transaction should be deleted
      const transactions = await helpers.getTransactions({ raw: true });
      expect(transactions.length).toBe(0);
    });

    it('should explicitly keep account transaction when deleteLinkedTransaction=false', async () => {
      const transfer = await helpers.accountToPortfolioTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: account.id,
          amount: '500',
          date: '2025-06-15',
        },
        raw: true,
      });

      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        deleteLinkedTransaction: false,
        raw: true,
      });

      const transactions = await helpers.getTransactions({ raw: true });
      expect(transactions.length).toBe(1);
      expect(transactions[0]!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
    });
  });

  describe('portfolio-to-account transfer deletion', () => {
    it('should reverse portfolio balance when deleting portfolio→account transfer', async () => {
      // Seed portfolio with cash
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        setAvailableCash: '1000',
        setTotalCash: '1000',
      });

      const transfer = await helpers.portfolioToAccountTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: account.id,
          amount: '300',
          currencyCode,
          date: '2025-06-15',
        },
        raw: true,
      });

      // Balance should be 700 after withdrawal
      const [balanceBefore] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceBefore!.availableCash).toBeNumericEqual(700);

      // Delete the transfer → should restore to 1000
      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        raw: true,
      });

      const [balanceAfter] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceAfter!.availableCash).toBeNumericEqual(1000);
      expect(balanceAfter!.totalCash).toBeNumericEqual(1000);
    });

    it('should keep account transaction and mark as out-of-wallet by default', async () => {
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        setAvailableCash: '1000',
        setTotalCash: '1000',
      });

      const transfer = await helpers.portfolioToAccountTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: account.id,
          amount: '300',
          currencyCode,
          date: '2025-06-15',
        },
        raw: true,
      });

      // Delete the transfer (default: keep linked transaction)
      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        raw: true,
      });

      // The account transaction should still exist but marked as out_of_wallet
      const transactions = await helpers.getTransactions({ raw: true });

      expect(transactions.length).toBe(1);
      expect(transactions[0]!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
    });

    it('should delete linked account transaction when deleteLinkedTransaction=true', async () => {
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        setAvailableCash: '1000',
        setTotalCash: '1000',
      });

      const transfer = await helpers.portfolioToAccountTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: account.id,
          amount: '300',
          currencyCode,
          date: '2025-06-15',
        },
        raw: true,
      });

      // Delete the transfer AND the linked transaction
      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        deleteLinkedTransaction: true,
        raw: true,
      });

      // The account transaction should be deleted
      const transactions = await helpers.getTransactions({ raw: true });
      expect(transactions.length).toBe(0);
    });

    it('should explicitly keep account transaction when deleteLinkedTransaction=false', async () => {
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        setAvailableCash: '1000',
        setTotalCash: '1000',
      });

      const transfer = await helpers.portfolioToAccountTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: account.id,
          amount: '300',
          currencyCode,
          date: '2025-06-15',
        },
        raw: true,
      });

      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        deleteLinkedTransaction: false,
        raw: true,
      });

      const transactions = await helpers.getTransactions({ raw: true });
      expect(transactions.length).toBe(1);
      expect(transactions[0]!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
    });
  });

  describe('portfolio-to-portfolio transfer deletion', () => {
    it('should reverse both portfolio balances when deleting p2p transfer', async () => {
      const destPortfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Destination Portfolio' }),
        raw: true,
      });

      const {
        currencies: [usdCurrency],
      } = await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });

      // Seed source with cash
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode: usdCurrency!.currencyCode,
        setAvailableCash: '1000',
        setTotalCash: '1000',
      });

      // Create p2p transfer
      const transfer = await helpers.createPortfolioTransfer({
        fromPortfolioId: portfolio.id,
        payload: helpers.buildPortfolioTransferPayload({
          toPortfolioId: destPortfolio.id,
          currencyCode: usdCurrency!.currencyCode,
          amount: '400',
        }),
        raw: true,
      });

      // Verify balances
      const [srcBefore] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode: usdCurrency!.currencyCode,
        raw: true,
      });
      expect(srcBefore!.availableCash).toBeNumericEqual(600);

      const [destBefore] = await helpers.getPortfolioBalance({
        portfolioId: destPortfolio.id,
        currencyCode: usdCurrency!.currencyCode,
        raw: true,
      });
      expect(destBefore!.availableCash).toBeNumericEqual(400);

      // Delete the transfer
      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        raw: true,
      });

      // Source should be back to 1000
      const [srcAfter] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode: usdCurrency!.currencyCode,
        raw: true,
      });
      expect(srcAfter!.availableCash).toBeNumericEqual(1000);

      // Dest should be back to 0
      const destAfter = await helpers.getPortfolioBalance({
        portfolioId: destPortfolio.id,
        currencyCode: usdCurrency!.currencyCode,
        raw: true,
      });
      if (destAfter.length > 0) {
        expect(destAfter[0]!.availableCash).toBeNumericEqual(0);
      }
    });
  });

  describe('deleting account transaction cascades to portfolio transfer', () => {
    it('should delete portfolio transfer and reverse balance when account tx is deleted', async () => {
      await helpers.accountToPortfolioTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: account.id,
          amount: '750',
          date: '2025-06-15',
        },
        raw: true,
      });

      // Verify balance was set
      const [balanceBefore] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceBefore!.availableCash).toBeNumericEqual(750);

      // Get the linked account transaction
      const transactions = await helpers.getTransactions({ raw: true });
      expect(transactions.length).toBe(1);
      expect(transactions[0]!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);

      // Delete the account transaction (not the portfolio transfer)
      await helpers.deleteTransaction({ id: transactions[0]!.id });

      // Portfolio transfer should also be deleted
      const transfersAfter = await helpers.listPortfolioTransfers({
        portfolioId: portfolio.id,
        raw: true,
      });
      expect(transfersAfter.data.length).toBe(0);

      // Portfolio balance should be reversed
      const balancesAfter = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      if (balancesAfter.length > 0) {
        expect(balancesAfter[0]!.availableCash).toBeNumericEqual(0);
        expect(balancesAfter[0]!.totalCash).toBeNumericEqual(0);
      }

      // Account transaction should be gone
      const txAfter = await helpers.getTransactions({ raw: true });
      expect(txAfter.length).toBe(0);
    });
  });

  describe('idempotent deletion', () => {
    it('should return 204 for non-existent transfer', async () => {
      const response = await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: 999999,
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 204 when deleting the same transfer twice', async () => {
      const transfer = await helpers.accountToPortfolioTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: account.id,
          amount: '500',
          date: '2025-06-15',
        },
        raw: true,
      });

      // First delete should succeed
      const firstResponse = await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
      });
      expect(firstResponse.statusCode).toBe(204);

      // Second delete should also return 204 (idempotent)
      const secondResponse = await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
      });
      expect(secondResponse.statusCode).toBe(204);
    });
  });

  describe('deleting account transaction cascades to portfolio-to-account transfer', () => {
    it('should delete portfolio transfer and reverse balance when p2a account tx is deleted', async () => {
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        setAvailableCash: '1000',
        setTotalCash: '1000',
      });

      await helpers.portfolioToAccountTransfer({
        portfolioId: portfolio.id,
        payload: {
          accountId: account.id,
          amount: '300',
          currencyCode,
          date: '2025-06-15',
        },
        raw: true,
      });

      // Balance should be 700 after withdrawal
      const [balanceBefore] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceBefore!.availableCash).toBeNumericEqual(700);

      // Get the linked account transaction (income on the account)
      const transactions = await helpers.getTransactions({ raw: true });
      expect(transactions.length).toBe(1);
      expect(transactions[0]!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio);

      // Delete the account transaction (not the portfolio transfer)
      await helpers.deleteTransaction({ id: transactions[0]!.id });

      // Portfolio transfer should also be deleted
      const transfersAfter = await helpers.listPortfolioTransfers({
        portfolioId: portfolio.id,
        raw: true,
      });
      expect(transfersAfter.data.length).toBe(0);

      // Portfolio balance should be restored to 1000
      const [balanceAfter] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceAfter!.availableCash).toBeNumericEqual(1000);
      expect(balanceAfter!.totalCash).toBeNumericEqual(1000);

      // Account transaction should be gone
      const txAfter = await helpers.getTransactions({ raw: true });
      expect(txAfter.length).toBe(0);
    });
  });
});
