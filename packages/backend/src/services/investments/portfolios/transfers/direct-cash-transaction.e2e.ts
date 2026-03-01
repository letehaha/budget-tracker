import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Accounts from '@models/Accounts.model';
import Portfolios from '@models/investments/Portfolios.model';
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
