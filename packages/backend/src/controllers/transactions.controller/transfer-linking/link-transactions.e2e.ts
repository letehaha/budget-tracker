import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('link transactions between each other', () => {
  it('link two valid transactions', async () => {
    // Create 2 income and 2 expense to check that multiple updation is possible
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });

    const [incomeA] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountA.id,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });
    const [incomeB] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountB.id,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });
    const [expenseA] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountA.id,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });
    const [expenseB] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountB.id,
        transactionType: TRANSACTION_TYPES.expense,
      }),
      raw: true,
    });

    const linkingResult = await helpers.linkTransactions({
      payload: {
        ids: [
          [incomeA.id, expenseB.id],
          [incomeB.id, expenseA.id],
        ],
      },
      raw: true,
    });

    // Check that linkind response is coorect
    [incomeA, incomeB, expenseA, expenseB].forEach((tx) => {
      const txAfter = linkingResult.flat().find((t) => t.id === tx.id);
      // Expect that only transferNature and transferId were changed
      expect({ ...tx }).toEqual({
        ...txAfter,
        transferNature: expect.toBeAnythingOrNull(),
        transferId: expect.toBeAnythingOrNull(),
      });

      expect(txAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
      expect(txAfter!.transferId).toEqual(expect.any(String));
    });

    // Check that transactions fetching also returns correct result
    const txsAfterUpdation = await helpers.getTransactions({ raw: true });
    [incomeA, incomeB, expenseA, expenseB].forEach((tx) => {
      const txAfter = txsAfterUpdation.find((t) => t.id === tx.id);
      // Expect that only transferNature and transferId were changed
      expect({ ...tx }).toEqual({
        ...txAfter,
        transferNature: expect.toBeAnythingOrNull(),
        transferId: expect.toBeAnythingOrNull(),
      });

      expect(txAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
      expect(txAfter!.transferId).toEqual(expect.any(String));
    });

    expect(incomeA.transferId).toBe(expenseB.transferId);
    expect(incomeB.transferId).toBe(expenseA.transferId);
  });

  it('throws an error when trying to link tx from the same account', async () => {
    await helpers.monobank.pair();
    const { account, transactions } = await helpers.monobank.mockTransactions();

    // Explicitly filter by account to ensure both transactions are from the same account
    const tx1 = transactions.find(
      (item) => item.transactionType === TRANSACTION_TYPES.expense && item.accountId === account.id,
    );
    const tx2 = transactions.find(
      (item) => item.transactionType === TRANSACTION_TYPES.income && item.accountId === account.id,
    );

    const result = await helpers.linkTransactions({
      payload: {
        ids: [[tx1!.id, tx2!.id]],
      },
    });
    expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it.each([[TRANSACTION_TYPES.expense], [TRANSACTION_TYPES.income]])(
    'throws an error when trying to link tx with same transactionType. test %s type',
    async (txType) => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      const [tx1] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          transactionType: txType,
        }),
        raw: true,
      });
      const [tx2] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountB.id,
          transactionType: txType,
        }),
        raw: true,
      });

      const result = await helpers.linkTransactions({
        payload: {
          ids: [[tx1.id, tx2.id]],
        },
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    },
  );

  it.each([[TRANSACTION_TYPES.expense], [TRANSACTION_TYPES.income]])(
    'throws an error when trying to link to the transaction that is already a transfer. test %s type',
    async (txType) => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });
      const accountC = await helpers.createAccount({ raw: true });

      const [tx1] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          transactionType: txType,
        }),
        raw: true,
      });
      const transactions = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: accountB.id,
            amount: 10,
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
            destinationAmount: 20,
            destinationAccountId: accountC.id,
          }),
        },
        raw: true,
      });

      const expenseTx = transactions.find((t) => t!.transactionType === TRANSACTION_TYPES.expense);
      const incomeTx = transactions.find((t) => t!.transactionType === TRANSACTION_TYPES.income);

      const result = await helpers.linkTransactions({
        payload: {
          ids: [[tx1.id, txType === TRANSACTION_TYPES.income ? expenseTx!.id : incomeTx!.id]],
        },
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    },
  );
});
