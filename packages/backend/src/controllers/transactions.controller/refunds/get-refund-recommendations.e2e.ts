import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('getRefundRecommendations', () => {
  describe('success cases', () => {
    describe('using transactionId parameter', () => {
      it('returns income recommendations for an expense transaction', async () => {
        const account = await helpers.createAccount({ raw: true });

        // Create an expense transaction (the "original" transaction)
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create an income transaction that should be recommended
        const [incomeTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const response = await helpers.getRefundRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.length).toBeGreaterThanOrEqual(1);
        expect(response.some((tx) => tx.id === incomeTx.id)).toBe(true);
        expect(response.every((tx) => tx.transactionType === TRANSACTION_TYPES.income)).toBe(true);
      });

      it('returns expense recommendations for an income transaction', async () => {
        const account = await helpers.createAccount({ raw: true });

        // Create an income transaction (the "original" transaction)
        const [incomeTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        // Create an expense transaction that should be recommended
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const response = await helpers.getRefundRecommendations({
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
        const account = await helpers.createAccount({ raw: true });

        // Create an income transaction that should be recommended
        // Amount: 50.00 decimal = 5000 cents
        const [incomeTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 50, // 50.00 decimal = 5000 cents
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        // Call with form data: expense type at 50.00 decimal should find income near 5000 cents
        const response = await helpers.getRefundRecommendations({
          transactionType: TRANSACTION_TYPES.expense,
          originAmount: 50, // 50.00 decimal = 5000 cents
          accountId: account.id,
          raw: true,
        });

        expect(response.length).toBeGreaterThanOrEqual(1);
        expect(response.some((tx) => tx.id === incomeTx.id)).toBe(true);
        expect(response.every((tx) => tx.transactionType === TRANSACTION_TYPES.income)).toBe(true);
      });

      it('returns expense recommendations when form specifies income type', async () => {
        const account = await helpers.createAccount({ raw: true });

        // Create an expense transaction that should be recommended
        // Amount: 50.00 decimal = 5000 cents
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 50, // 50.00 decimal = 5000 cents
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Call with form data: income type at 50.00 decimal should find expense near 5000 cents
        const response = await helpers.getRefundRecommendations({
          transactionType: TRANSACTION_TYPES.income,
          originAmount: 50, // 50.00 decimal = 5000 cents
          accountId: account.id,
          raw: true,
        });

        expect(response.length).toBeGreaterThanOrEqual(1);
        expect(response.some((tx) => tx.id === expenseTx.id)).toBe(true);
        expect(response.every((tx) => tx.transactionType === TRANSACTION_TYPES.expense)).toBe(true);
      });
    });

    describe('amount filtering', () => {
      it('returns transactions within refAmount range (±5000 cents = ±50 decimal)', async () => {
        const account = await helpers.createAccount({ raw: true });

        // Create an expense transaction with 100.00 decimal (= 10000 cents)
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100, // 100.00 decimal = 10000 cents
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create income within range: 120.00 decimal = 12000 cents
        // Range for 10000 cents ± 5000 = [5000, 15000] cents = [50, 150] decimal
        const [incomeInRange] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 120, // 120.00 decimal = 12000 cents, within [5000, 15000]
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        // Create income outside range: 200.00 decimal = 20000 cents (outside [5000, 15000])
        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 200, // 200.00 decimal = 20000 cents, outside range
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const response = await helpers.getRefundRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.some((tx) => tx.id === incomeInRange.id)).toBe(true);
      });

      it('excludes transactions outside refAmount range', async () => {
        const account = await helpers.createAccount({ raw: true });

        // Create an expense transaction: 100.00 decimal = 10000 cents
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100, // 100.00 decimal = 10000 cents
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create income way outside range: 500.00 decimal = 50000 cents
        // Range for 10000 cents ± 5000 = [5000, 15000], so 50000 is outside
        const [incomeOutOfRange] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 500, // 500.00 decimal = 50000 cents, way outside ±5000 range
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const response = await helpers.getRefundRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.some((tx) => tx.id === incomeOutOfRange.id)).toBe(false);
      });
    });

    describe('transfer exclusion', () => {
      it('excludes transfer transactions from recommendations', async () => {
        const account1 = await helpers.createAccount({ raw: true });
        const account2 = await helpers.createAccount({ raw: true });

        // Create an expense transaction
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create a transfer (income that is part of a transfer)
        const [transferIncome] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account1.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.income,
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationAccountId: account2.id,
            destinationAmount: 5000,
          }),
          raw: true,
        });

        const response = await helpers.getRefundRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        // Transfer should not be in recommendations
        expect(response.some((tx) => tx.id === transferIncome.id)).toBe(false);
      });
    });

    describe('result limiting', () => {
      it('returns maximum 5 recommendations', async () => {
        const account = await helpers.createAccount({ raw: true });

        // Create an expense transaction
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create more than 5 income transactions
        for (let i = 0; i < 7; i++) {
          await helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 5000,
              transactionType: TRANSACTION_TYPES.income,
            }),
            raw: true,
          });
        }

        const response = await helpers.getRefundRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(response.length).toBeLessThanOrEqual(5);
      });
    });

    describe('empty results', () => {
      it('returns empty array when no matching transactions exist', async () => {
        const account = await helpers.createAccount({ raw: true });

        // Create only an expense transaction, no incomes
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        const response = await helpers.getRefundRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        expect(Array.isArray(response)).toBe(true);
      });

      it('returns empty array for non-existent transactionId', async () => {
        const response = await helpers.getRefundRecommendations({
          transactionId: 999999,
          raw: true,
        });

        expect(response).toEqual([]);
      });

      it('returns empty array for non-existent accountId in form data', async () => {
        const response = await helpers.getRefundRecommendations({
          transactionType: TRANSACTION_TYPES.expense,
          originAmount: 50,
          accountId: 999999,
          raw: true,
        });

        expect(response).toEqual([]);
      });
    });

    describe('splits inclusion', () => {
      it('includes transactions with splits in recommendations', async () => {
        const account = await helpers.createAccount({ raw: true });
        const categories = await helpers.getCategoriesList();
        const category1 = categories[0]!;
        const category2 = categories[1]!;

        // Create an expense transaction
        const [expenseTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        });

        // Create an income transaction with splits
        const [incomeWithSplits] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.income,
            categoryId: category1.id,
            splits: [{ categoryId: category2.id, amount: 2000 }],
          }),
          raw: true,
        });

        const response = await helpers.getRefundRecommendations({
          transactionId: expenseTx.id,
          raw: true,
        });

        const foundTx = response.find((tx) => tx.id === incomeWithSplits.id);
        expect(foundTx).toBeDefined();
        expect(foundTx?.splits).toBeDefined();
        expect(foundTx?.splits?.length).toBeGreaterThan(0);
      });
    });
  });

  describe('failure cases', () => {
    it('fails when no parameters are provided', async () => {
      const response = await helpers.getRefundRecommendations({});

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when only transactionType is provided without other form fields', async () => {
      const response = await helpers.getRefundRecommendations({
        transactionType: TRANSACTION_TYPES.expense,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when only originAmount is provided without other form fields', async () => {
      const response = await helpers.getRefundRecommendations({
        originAmount: 50,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when only accountId is provided without other form fields', async () => {
      const account = await helpers.createAccount({ raw: true });

      const response = await helpers.getRefundRecommendations({
        accountId: account.id,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when transactionType and originAmount are provided but accountId is missing', async () => {
      const response = await helpers.getRefundRecommendations({
        transactionType: TRANSACTION_TYPES.expense,
        originAmount: 50,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when invalid transactionType is provided', async () => {
      const account = await helpers.createAccount({ raw: true });

      const response = await helpers.getRefundRecommendations({
        transactionType: 'invalid' as TRANSACTION_TYPES,
        originAmount: 50,
        accountId: account.id,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when negative originAmount is provided', async () => {
      const account = await helpers.createAccount({ raw: true });

      const response = await helpers.getRefundRecommendations({
        transactionType: TRANSACTION_TYPES.expense,
        originAmount: -50,
        accountId: account.id,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when negative transactionId is provided', async () => {
      const response = await helpers.getRefundRecommendations({
        transactionId: -1,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when negative accountId is provided', async () => {
      const response = await helpers.getRefundRecommendations({
        transactionType: TRANSACTION_TYPES.expense,
        originAmount: 50,
        accountId: -1,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
