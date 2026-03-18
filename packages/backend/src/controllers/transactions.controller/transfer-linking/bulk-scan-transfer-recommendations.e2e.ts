import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { addDays, startOfDay, subDays } from 'date-fns';

describe('bulkScanTransferRecommendations', () => {
  const today = startOfDay(new Date());
  const todayISO = today.toISOString();
  const thirtyDaysAgo = subDays(today, 30).toISOString();

  describe('success cases', () => {
    it('returns matching expense-income pairs', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      // Create an expense
      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
          time: todayISO,
        }),
        raw: true,
      });

      // Create a matching income on a different account
      const [income] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          time: todayISO,
        }),
        raw: true,
      });

      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      expect(response.total).toBeGreaterThanOrEqual(1);
      const pair = response.items.find((item) => item.expense.id === expense.id);
      expect(pair).toBeDefined();
      expect(pair!.matches.length).toBeGreaterThanOrEqual(1);
      expect(pair!.matches.some((m) => m.transaction.id === income.id)).toBe(true);
    });

    it('returns confidence scores between 0 and 100', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
          time: todayISO,
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          time: todayISO,
        }),
        raw: true,
      });

      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      for (const item of response.items) {
        for (const match of item.matches) {
          expect(match.confidence).toBeGreaterThanOrEqual(0);
          expect(match.confidence).toBeLessThanOrEqual(100);
        }
      }
    });

    it('gives higher confidence to exact amount + same day + same currency', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
          time: todayISO,
        }),
        raw: true,
      });

      // Perfect match: same amount, same day
      const [perfectMatch] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          time: todayISO,
        }),
        raw: true,
      });

      // Weaker match: slightly different amount, 5 days apart
      const [weakerMatch] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 540,
          transactionType: TRANSACTION_TYPES.income,
          time: subDays(today, 5).toISOString(),
        }),
        raw: true,
      });

      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      const pair = response.items.find((item) => item.expense.id === expense.id);
      expect(pair).toBeDefined();
      expect(pair!.matches.length).toBeGreaterThanOrEqual(2);

      // First match should be the perfect one (highest confidence)
      expect(pair!.matches[0]!.transaction.id).toBe(perfectMatch.id);
      expect(pair!.matches[0]!.confidence).toBeGreaterThan(pair!.matches[1]!.confidence);
    });

    it('excludes transactions already linked as transfers', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      // Create a transfer pair (already linked)
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
          time: todayISO,
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAccountId: account2.id,
          destinationAmount: 500,
        }),
        raw: true,
      });

      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      // The already-linked expense should not appear in results
      const linkedExpenses = response.items.filter(
        (item) => item.expense.transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer,
      );
      expect(linkedExpenses.length).toBe(0);
    });

    it('excludes transactions on the same account', async () => {
      const account1 = await helpers.createAccount({ raw: true });

      // Create expense and income on the SAME account
      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
          time: todayISO,
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          time: todayISO,
        }),
        raw: true,
      });

      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      // The expense should not match income on the same account
      const pair = response.items.find((item) => item.expense.id === expense.id);
      expect(pair).toBeUndefined();
    });

    it('respects amount tolerance (±10%)', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          time: todayISO,
        }),
        raw: true,
      });

      // Within 10%: 109 (9% off)
      const [withinRange] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 109,
          transactionType: TRANSACTION_TYPES.income,
          time: todayISO,
        }),
        raw: true,
      });

      // Outside 10%: 112 (12% off)
      const [outsideRange] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 112,
          transactionType: TRANSACTION_TYPES.income,
          time: todayISO,
        }),
        raw: true,
      });

      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      const pair = response.items.find((item) => item.expense.id === expense.id);
      expect(pair).toBeDefined();
      expect(pair!.matches.some((m) => m.transaction.id === withinRange.id)).toBe(true);
      expect(pair!.matches.some((m) => m.transaction.id === outsideRange.id)).toBe(false);
    });

    it('respects date tolerance (±14 days)', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
          time: todayISO,
        }),
        raw: true,
      });

      // Within 14 days: 10 days ago
      const [withinRange] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          time: subDays(today, 10).toISOString(),
        }),
        raw: true,
      });

      // Outside 14 days: 15 days ago
      const [outsideRange] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          time: subDays(today, 15).toISOString(),
        }),
        raw: true,
      });

      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      const pair = response.items.find((item) => item.expense.id === expense.id);
      expect(pair).toBeDefined();
      expect(pair!.matches.some((m) => m.transaction.id === withinRange.id)).toBe(true);
      expect(pair!.matches.some((m) => m.transaction.id === outsideRange.id)).toBe(false);
    });

    it('returns max 4 matches per expense', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
          time: todayISO,
        }),
        raw: true,
      });

      // Create 6 matching incomes
      for (let i = 0; i < 6; i++) {
        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 500 + i,
            transactionType: TRANSACTION_TYPES.income,
            time: subDays(today, i).toISOString(),
          }),
          raw: true,
        });
      }

      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      for (const item of response.items) {
        expect(item.matches.length).toBeLessThanOrEqual(4);
      }
    });

    it('returns empty results for date range with no expenses', async () => {
      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: subDays(today, 365).toISOString(),
        dateTo: subDays(today, 300).toISOString(),
        raw: true,
      });

      expect(response.total).toBe(0);
      expect(response.items).toEqual([]);
    });

    it('supports pagination with limit and offset', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      // Create 3 expenses with matches
      for (let i = 0; i < 3; i++) {
        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100 * (i + 1),
            transactionType: TRANSACTION_TYPES.expense,
            time: subDays(today, i).toISOString(),
          }),
          raw: true,
        });

        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100 * (i + 1),
            transactionType: TRANSACTION_TYPES.income,
            time: subDays(today, i).toISOString(),
          }),
          raw: true,
        });
      }

      // Get first page (limit 2)
      const page1 = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        limit: 2,
        offset: 0,
        raw: true,
      });

      expect(page1.total).toBeGreaterThanOrEqual(3);
      expect(page1.items.length).toBe(2);

      // Get second page
      const page2 = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        limit: 2,
        offset: 2,
        raw: true,
      });

      expect(page2.total).toBeGreaterThanOrEqual(3);
      expect(page2.items.length).toBeGreaterThanOrEqual(1);

      // No overlap between pages
      const page1Ids = page1.items.map((item) => item.expense.id);
      const page2Ids = page2.items.map((item) => item.expense.id);
      expect(page1Ids.filter((id) => page2Ids.includes(id))).toEqual([]);
    });

    it('finds incomes outside the date range that are within ±14 days of boundary expenses', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      // Expense at the start of the date range
      const rangeStart = subDays(today, 20);
      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
          time: rangeStart.toISOString(),
        }),
        raw: true,
      });

      // Income 10 days before the range start (outside date range but within ±14 days of the expense)
      const [incomeOutsideRange] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          time: subDays(rangeStart, 10).toISOString(),
        }),
        raw: true,
      });

      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: rangeStart.toISOString(),
        dateTo: todayISO,
        raw: true,
      });

      const pair = response.items.find((item) => item.expense.id === expense.id);
      expect(pair).toBeDefined();
      expect(pair!.matches.some((m) => m.transaction.id === incomeOutsideRange.id)).toBe(true);
    });

    it('sorts results by expense date descending', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      const dates = [subDays(today, 10), subDays(today, 5), today];

      for (const date of dates) {
        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 500,
            transactionType: TRANSACTION_TYPES.expense,
            time: date.toISOString(),
          }),
          raw: true,
        });

        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 500,
            transactionType: TRANSACTION_TYPES.income,
            time: date.toISOString(),
          }),
          raw: true,
        });
      }

      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      // Check that expenses are sorted newest first
      for (let i = 1; i < response.items.length; i++) {
        const prevTime = new Date(response.items[i - 1]!.expense.time).getTime();
        const currTime = new Date(response.items[i]!.expense.time).getTime();
        expect(prevTime).toBeGreaterThanOrEqual(currTime);
      }
    });

    it('matches sort by confidence descending within each expense', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
          time: todayISO,
        }),
        raw: true,
      });

      // Create multiple incomes with varying proximity
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          time: todayISO,
        }),
        raw: true,
      });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 540,
          transactionType: TRANSACTION_TYPES.income,
          time: subDays(today, 7).toISOString(),
        }),
        raw: true,
      });

      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      for (const item of response.items) {
        for (let i = 1; i < item.matches.length; i++) {
          expect(item.matches[i - 1]!.confidence).toBeGreaterThanOrEqual(item.matches[i]!.confidence);
        }
      }
    });
  });

  describe('error cases', () => {
    it('returns validation error when dateFrom is after dateTo', async () => {
      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: todayISO,
        dateTo: thirtyDaysAgo,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns validation error when dates are missing', async () => {
      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: '',
        dateTo: '',
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns validation error when limit exceeds maximum', async () => {
      const response = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        limit: 100,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
