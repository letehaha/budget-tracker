import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { addDays, startOfDay, subDays } from 'date-fns';

describe('getTransferRecommendations', () => {
  describe('success cases', () => {
    describe('using transactionId parameter', () => {
      it('returns income recommendations for an expense transaction', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        // Create an expense transaction (source)
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100, // 100.00 decimal = 10000 cents
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create an income transaction on different account
        const [incomeTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100, // Same amount
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.length).toBeGreaterThanOrEqual(1);
        expect(response.some((tx) => tx.id === incomeTx.id)).toBe(true);
        expect(response.every((tx) => tx.transactionType === TRANSACTION_TYPES.income)).toBe(true);
      });

      it('returns expense recommendations for an income transaction', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        const today = startOfDay(new Date());

        // Create an income transaction (source) - today
        const [incomeTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
            time: today.toISOString(),
          }),
          raw: true,
        });

        // Create an expense transaction on different account - 3 days ago (within 2 weeks before income)
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
            time: subDays(today, 3).toISOString(),
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: incomeTx.id,
          raw: true,
        });

        expect(response.length).toBeGreaterThanOrEqual(1);
        expect(response.some((tx) => tx.id === expenseTx.id)).toBe(true);
        expect(response.every((tx) => tx.transactionType === TRANSACTION_TYPES.expense)).toBe(true);
      });
    });

    describe('using form data parameters', () => {
      it('returns income recommendations when form specifies expense type', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        // Create an income transaction on different account
        const [incomeTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionType: TRANSACTION_TYPES.expense,
          originAmount: 100,
          accountId: account1.id,
          raw: true,
        });

        expect(response.length).toBeGreaterThanOrEqual(1);
        expect(response.some((tx) => tx.id === incomeTx.id)).toBe(true);
        expect(response.every((tx) => tx.transactionType === TRANSACTION_TYPES.income)).toBe(true);
      });
    });

    describe('amount filtering (±10% range)', () => {
      it('returns transactions within ±10% refAmount range', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        // Create an expense: 100.00 decimal = 10000 cents
        // ±10% range: 9000 to 11000 cents = 90 to 110 decimal
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Income within range: 105 (10500 cents, within 9000-11000)
        const [incomeInRange] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 105,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.some((tx) => tx.id === incomeInRange.id)).toBe(true);
      });

      it('excludes transactions outside ±10% refAmount range', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        // Create an expense: 100.00 decimal = 10000 cents
        // ±10% range: 9000 to 11000 cents
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Income outside range: 150 (15000 cents, outside 9000-11000)
        const [incomeOutOfRange] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 150,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.some((tx) => tx.id === incomeOutOfRange.id)).toBe(false);
      });
    });

    describe('date filtering (2 weeks, income.time >= expense.time)', () => {
      it('includes income after expense within 2 weeks', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        const expenseDate = startOfDay(new Date());

        // Create expense
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
            time: expenseDate.toISOString(),
          }),
          raw: true,
        });

        // Income 5 days after expense (within 2 weeks)
        const [incomeAfter] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
            time: addDays(expenseDate, 5).toISOString(),
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.some((tx) => tx.id === incomeAfter.id)).toBe(true);
      });

      it('excludes income before expense when searching from expense', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        const expenseDate = startOfDay(new Date());

        // Income 5 days before expense
        const [incomeBefore] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
            time: subDays(expenseDate, 5).toISOString(),
          }),
          raw: true,
        });

        // Create expense
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
            time: expenseDate.toISOString(),
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        // Income before expense should NOT be found (money can't arrive before being sent)
        expect(response.some((tx) => tx.id === incomeBefore.id)).toBe(false);
      });

      it('includes expense before income when searching from income', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        const incomeDate = startOfDay(new Date());

        // Expense 5 days before income (within 2 weeks)
        const [expenseBefore] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
            time: subDays(incomeDate, 5).toISOString(),
          }),
          raw: true,
        });

        // Create income
        const [incomeTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
            time: incomeDate.toISOString(),
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: incomeTx.id,
          raw: true,
        });

        expect(response.some((tx) => tx.id === expenseBefore.id)).toBe(true);
      });

      it('excludes transactions outside 2-week window', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        const expenseDate = startOfDay(new Date());

        // Create expense
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
            time: expenseDate.toISOString(),
          }),
          raw: true,
        });

        // Income 20 days after expense (outside 2 weeks)
        const [incomeTooLate] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
            time: addDays(expenseDate, 20).toISOString(),
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.some((tx) => tx.id === incomeTooLate.id)).toBe(false);
      });
    });

    describe('account filtering', () => {
      it('excludes transactions from the same account', async () => {
        const account1 = await helpers.createAccount({ raw: true });

        // Create expense
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Income on SAME account - should be excluded
        const [incomeSameAccount] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id, // Same account
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.some((tx) => tx.id === incomeSameAccount.id)).toBe(false);
      });
    });

    describe('transfer exclusion', () => {
      it('excludes already-linked transfer transactions', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });
        const account3 = await helpers.createAccount({ raw: true });

        // Create expense
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create a transfer (income that is already part of a transfer)
        const [transferIncome] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationAccountId: account3.id,
            destinationAmount: 100,
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.some((tx) => tx.id === transferIncome.id)).toBe(false);
      });
    });

    describe('refund exclusion', () => {
      it('excludes refund-linked transactions', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        // Create expense
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create an original expense to refund
        const [originalExpense] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create income and link as refund
        const [refundIncome] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        await helpers.createSingleRefund(
          {
            originalTxId: originalExpense.id,
            refundTxId: refundIncome.id,
          },
          true,
        );

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        // Refund-linked transaction should be excluded
        expect(response.some((tx) => tx.id === refundIncome.id)).toBe(false);
      });
    });

    describe('splits exclusion', () => {
      it('excludes parent transactions that have splits', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });
        const categories = await helpers.getCategoriesList();
        const category1 = categories[0]!;
        const category2 = categories[1]!;

        // Create expense
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create income with splits - should be excluded
        const [incomeWithSplits] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
            categoryId: category1.id,
            splits: [{ categoryId: category2.id, amount: 50 }],
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.some((tx) => tx.id === incomeWithSplits.id)).toBe(false);
      });
    });

    describe('result limiting', () => {
      it('returns maximum 5 recommendations', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        // Create expense
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create more than 5 income transactions
        for (let i = 0; i < 7; i++) {
          await helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account2.id,
              amount: 100,
              transactionType: TRANSACTION_TYPES.income,
            }),
            raw: true,
          });
        }

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.length).toBeLessThanOrEqual(5);
      });
    });

    describe('sorting', () => {
      it('prioritizes same currency matches', async () => {
        const account1 = await helpers.createAccount({ raw: true }); // Base currency
        const { account: account2 } = await helpers.createAccountWithNewCurrency({ currency: 'EUR' });
        const account3 = await helpers.createAccount({ raw: true }); // Base currency

        // Create expense in base currency
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create income in different currency (EUR)
        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        // Create income in same currency (base)
        const [incomeSameCurrency] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account3.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        // Same currency should be prioritized (first in results)
        expect(response.length).toBeGreaterThanOrEqual(1);
        expect(response[0]?.id).toBe(incomeSameCurrency.id);
      });

      it('sorts by amount proximity (closer amounts first)', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        // Create expense: 100
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create income further from target: 108 (8% diff)
        const [incomeFarther] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 108,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        // Create income closer to target: 102 (2% diff)
        const [incomeCloser] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account2.id,
            amount: 102,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.length).toBeGreaterThanOrEqual(2);
        const closerIndex = response.findIndex((tx) => tx.id === incomeCloser.id);
        const fartherIndex = response.findIndex((tx) => tx.id === incomeFarther.id);
        expect(closerIndex).toBeLessThan(fartherIndex);
      });
    });

    describe('empty results', () => {
      it('returns empty array when no matching transactions exist', async () => {
        const account = await helpers.createAccount({ raw: true });

        // Create only an expense, no incomes on other accounts
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const response = await helpers.getTransferRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(Array.isArray(response)).toBe(true);
      });

      it('returns empty array for non-existent transactionId', async () => {
        const response = await helpers.getTransferRecommendations({
          transactionId: 999999,
          raw: true,
        });

        expect(response).toEqual([]);
      });

      it('returns empty array for non-existent accountId in form data', async () => {
        const response = await helpers.getTransferRecommendations({
          transactionType: TRANSACTION_TYPES.expense,
          originAmount: 100,
          accountId: 999999,
          raw: true,
        });

        expect(response).toEqual([]);
      });
    });
  });

  describe('failure cases', () => {
    it('fails when no parameters are provided', async () => {
      const response = await helpers.getTransferRecommendations({});

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when only transactionType is provided without other form fields', async () => {
      const response = await helpers.getTransferRecommendations({
        transactionType: TRANSACTION_TYPES.expense,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when only originAmount is provided without other form fields', async () => {
      const response = await helpers.getTransferRecommendations({
        originAmount: 100,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when only accountId is provided without other form fields', async () => {
      const account = await helpers.createAccount({ raw: true });

      const response = await helpers.getTransferRecommendations({
        accountId: account.id,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when transactionType and originAmount are provided but accountId is missing', async () => {
      const response = await helpers.getTransferRecommendations({
        transactionType: TRANSACTION_TYPES.expense,
        originAmount: 100,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when invalid transactionType is provided', async () => {
      const account = await helpers.createAccount({ raw: true });

      const response = await helpers.getTransferRecommendations({
        transactionType: 'invalid' as TRANSACTION_TYPES,
        originAmount: 100,
        accountId: account.id,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when negative originAmount is provided', async () => {
      const account = await helpers.createAccount({ raw: true });

      const response = await helpers.getTransferRecommendations({
        transactionType: TRANSACTION_TYPES.expense,
        originAmount: -100,
        accountId: account.id,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when negative transactionId is provided', async () => {
      const response = await helpers.getTransferRecommendations({
        transactionId: -1,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when negative accountId is provided', async () => {
      const response = await helpers.getTransferRecommendations({
        transactionType: TRANSACTION_TYPES.expense,
        originAmount: 100,
        accountId: -1,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
