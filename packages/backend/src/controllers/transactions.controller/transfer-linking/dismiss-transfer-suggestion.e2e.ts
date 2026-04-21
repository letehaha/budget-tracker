import { TRANSACTION_TYPES } from '@bt/shared/types';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { startOfDay, subDays } from 'date-fns';

describe('dismissTransferSuggestion', () => {
  const today = startOfDay(new Date());
  const todayISO = today.toISOString();
  const thirtyDaysAgo = subDays(today, 30).toISOString();

  describe('success cases', () => {
    it('dismisses a suggestion pair and returns 204', async () => {
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

      const [income] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          time: todayISO,
        }),
        raw: true,
      });

      const response = await helpers.dismissTransferSuggestion({
        expenseTransactionId: expense.id,
        incomeTransactionId: income.id,
      });

      expect(response.statusCode).toBe(204);
    });

    it('is idempotent — dismissing the same pair twice succeeds', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.expense,
          time: todayISO,
        }),
        raw: true,
      });

      const [income] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.income,
          time: todayISO,
        }),
        raw: true,
      });

      const first = await helpers.dismissTransferSuggestion({
        expenseTransactionId: expense.id,
        incomeTransactionId: income.id,
      });
      expect(first.statusCode).toBe(204);

      const second = await helpers.dismissTransferSuggestion({
        expenseTransactionId: expense.id,
        incomeTransactionId: income.id,
      });
      expect(second.statusCode).toBe(204);
    });

    it('dismissed pairs are excluded from bulk-scan results', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account1.id,
          amount: 700,
          transactionType: TRANSACTION_TYPES.expense,
          time: todayISO,
        }),
        raw: true,
      });

      const [income] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account2.id,
          amount: 700,
          transactionType: TRANSACTION_TYPES.income,
          time: todayISO,
        }),
        raw: true,
      });

      // Verify the pair appears before dismissing
      const beforeDismiss = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      const pairBefore = beforeDismiss.items.find((item) => item.expense.id === expense.id);
      expect(pairBefore).toBeDefined();
      expect(pairBefore!.matches.some((m) => m.transaction.id === income.id)).toBe(true);

      // Dismiss the pair
      await helpers.dismissTransferSuggestion({
        expenseTransactionId: expense.id,
        incomeTransactionId: income.id,
      });

      // Verify the dismissed pair no longer appears
      const afterDismiss = await helpers.bulkScanTransferRecommendations({
        dateFrom: thirtyDaysAgo,
        dateTo: todayISO,
        raw: true,
      });

      const pairAfter = afterDismiss.items.find((item) => item.expense.id === expense.id);
      // Either the expense is gone entirely, or the dismissed income is removed from matches
      if (pairAfter) {
        expect(pairAfter.matches.some((m) => m.transaction.id === income.id)).toBe(false);
      }
    });
  });

  describe('error cases', () => {
    it('returns validation error when expenseTransactionId is missing', async () => {
      const response = await helpers.dismissTransferSuggestion({
        expenseTransactionId: undefined as unknown as number,
        incomeTransactionId: 1,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns validation error when incomeTransactionId is missing', async () => {
      const response = await helpers.dismissTransferSuggestion({
        expenseTransactionId: 1,
        incomeTransactionId: undefined as unknown as number,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns validation error for non-positive IDs', async () => {
      const response = await helpers.dismissTransferSuggestion({
        expenseTransactionId: -1,
        incomeTransactionId: 0,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
