import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/accounts.model';
import Portfolios from '@models/investments/portfolios.model';
import * as helpers from '@tests/helpers';

describe('Direct Cash Transaction (POST /investments/portfolios/:id/cash-transaction)', () => {
  let portfolio: Portfolios;
  let account: Accounts;
  let currencyCode: string;

  beforeEach(async () => {
    portfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'Cash Portfolio' }),
      raw: true,
    });

    // Create an account to get a valid user currency
    account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'Main Account' }),
      raw: true,
    });

    currencyCode = account.currencyCode;
  });

  describe('deposits', () => {
    it('should create a deposit and increase portfolio balance', async () => {
      const transfer = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '1000',
          currencyCode,
          date: '2025-06-15',
          description: 'Initial funding',
        },
        raw: true,
      });

      expect(transfer).toMatchObject({
        id: expect.any(Number),
        fromAccountId: null,
        toPortfolioId: portfolio.id,
        fromPortfolioId: null,
        toAccountId: null,
        amount: expect.toBeNumericEqual('1000'),
        refAmount: expect.any(String),
        currencyCode,
        description: 'Initial funding',
        transactionId: null,
      });

      // Verify portfolio cash balance increased
      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });

      expect(balance!.availableCash).toBeNumericEqual(1000);
      expect(balance!.totalCash).toBeNumericEqual(1000);
    });

    it('should accumulate multiple deposits', async () => {
      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '500',
          currencyCode,
          date: '2025-06-10',
        },
        raw: true,
      });

      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '300',
          currencyCode,
          date: '2025-06-15',
        },
        raw: true,
      });

      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });

      expect(balance!.availableCash).toBeNumericEqual(800);
      expect(balance!.totalCash).toBeNumericEqual(800);
    });
  });

  describe('withdrawals', () => {
    it('should create a withdrawal and decrease portfolio balance', async () => {
      // Seed portfolio with cash first
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        setAvailableCash: '2000',
        setTotalCash: '2000',
      });

      const transfer = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'withdrawal',
          amount: '750',
          currencyCode,
          date: '2025-06-15',
          description: 'Partial withdrawal',
        },
        raw: true,
      });

      expect(transfer).toMatchObject({
        id: expect.any(Number),
        fromAccountId: null,
        toPortfolioId: null,
        fromPortfolioId: portfolio.id,
        toAccountId: null,
        amount: expect.toBeNumericEqual('750'),
        currencyCode,
        description: 'Partial withdrawal',
        transactionId: null,
      });

      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });

      expect(balance!.availableCash).toBeNumericEqual(1250);
      expect(balance!.totalCash).toBeNumericEqual(1250);
    });
  });

  describe('transfer list', () => {
    it('should appear in portfolio transfer list', async () => {
      const transfer = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
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
  });

  describe('delete reversal', () => {
    it('should reverse deposit balance on delete', async () => {
      const transfer = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '600',
          currencyCode,
          date: '2025-06-15',
        },
        raw: true,
      });

      // Verify balance after deposit
      const [balanceBefore] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceBefore!.availableCash).toBeNumericEqual(600);

      // Delete the transfer
      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        raw: true,
      });

      // Balance should be back to 0
      const balancesAfter = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });

      if (balancesAfter.length > 0) {
        expect(balancesAfter[0]!.availableCash).toBeNumericEqual(0);
        expect(balancesAfter[0]!.totalCash).toBeNumericEqual(0);
      }
    });

    it('should reverse withdrawal balance on delete', async () => {
      // Seed portfolio
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        setAvailableCash: '1000',
        setTotalCash: '1000',
      });

      const transfer = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'withdrawal',
          amount: '400',
          currencyCode,
          date: '2025-06-15',
        },
        raw: true,
      });

      // Balance should be 600 after withdrawal
      const [balanceBefore] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceBefore!.availableCash).toBeNumericEqual(600);

      // Delete the withdrawal transfer
      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        raw: true,
      });

      // Balance should be back to 1000
      const [balanceAfter] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balanceAfter!.availableCash).toBeNumericEqual(1000);
      expect(balanceAfter!.totalCash).toBeNumericEqual(1000);
    });
  });

  describe('historical flag', () => {
    it('records a historical deposit without changing the cash balance', async () => {
      const transfer = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '5000',
          currencyCode,
          date: '2022-01-15',
          description: 'Backfilled pre-tracking deposit',
          isHistorical: true,
        },
        raw: true,
      });

      expect(transfer).toMatchObject({
        id: expect.any(Number),
        toPortfolioId: portfolio.id,
        amount: expect.toBeNumericEqual('5000'),
        isHistorical: true,
      });

      // Balance must NOT change.
      const balances = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      if (balances.length > 0) {
        expect(balances[0]!.availableCash).toBeNumericEqual(0);
        expect(balances[0]!.totalCash).toBeNumericEqual(0);
      }
    });

    it('records a historical withdrawal without changing the cash balance', async () => {
      // Seed real cash so we can prove the withdrawal didn't touch it.
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        setAvailableCash: '1000',
        setTotalCash: '1000',
      });

      const transfer = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'withdrawal',
          amount: '500',
          currencyCode,
          date: '2022-06-01',
          isHistorical: true,
        },
        raw: true,
      });

      expect(transfer.isHistorical).toBe(true);

      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balance!.availableCash).toBeNumericEqual(1000);
      expect(balance!.totalCash).toBeNumericEqual(1000);
    });

    it('does not reverse balance when a historical transfer is deleted', async () => {
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        setAvailableCash: '750',
        setTotalCash: '750',
      });

      const transfer = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '2000',
          currencyCode,
          date: '2021-08-10',
          isHistorical: true,
        },
        raw: true,
      });

      await helpers.deletePortfolioTransfer({
        portfolioId: portfolio.id,
        transferId: transfer.id,
        raw: true,
      });

      // Balance must remain at the pre-transfer real value.
      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balance!.availableCash).toBeNumericEqual(750);
      expect(balance!.totalCash).toBeNumericEqual(750);
    });

    it('counts historical flows in extended-stats totals (totalDeposits, firstTransactionDate)', async () => {
      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '10000',
          currencyCode,
          date: '2022-03-15',
          isHistorical: true,
        },
        raw: true,
      });

      // Plus a real recent deposit so both kinds are present.
      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '500',
          currencyCode,
          date: '2025-12-01',
        },
        raw: true,
      });

      const stats = await helpers.getPortfolioExtendedStats({
        portfolioId: portfolio.id,
        raw: true,
      });

      expect(parseFloat(stats.totalDeposits)).toBeGreaterThanOrEqual(10500);
      // Earliest of (real deposit, historical deposit, first buy) — historical wins.
      expect(stats.firstTransactionDate).toBe('2022-03-15');
    });

    it('defaults to non-historical when the flag is omitted', async () => {
      const transfer = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '100',
          currencyCode,
          date: '2025-06-15',
        },
        raw: true,
      });

      expect(transfer.isHistorical).toBe(false);

      const [balance] = await helpers.getPortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode,
        raw: true,
      });
      expect(balance!.availableCash).toBeNumericEqual(100);
    });
  });

  describe('error cases', () => {
    it('should reject zero amount', async () => {
      const response = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '0',
          currencyCode,
          date: '2025-06-15',
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should reject negative amount', async () => {
      const response = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '-100',
          currencyCode,
          date: '2025-06-15',
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should reject non-existent portfolio', async () => {
      const response = await helpers.directCashTransaction({
        portfolioId: 999999,
        payload: {
          type: 'deposit',
          amount: '100',
          currencyCode,
          date: '2025-06-15',
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('should reject non-existent currency', async () => {
      const response = await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '100',
          currencyCode: 'ZZZ',
          date: '2025-06-15',
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });
});
