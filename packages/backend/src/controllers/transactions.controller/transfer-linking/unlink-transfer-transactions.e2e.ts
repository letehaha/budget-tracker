import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import * as helpers from '@tests/helpers';

describe('Unlink transfer transactions', () => {
  it('unlink system transactions', async () => {
    // Firstly create two transfer transactions
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });

    await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({ accountId: accountA.id }),
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: faker.number.int({ max: 1000 }) * 1000,
        destinationAccountId: accountB.id,
      },
      raw: true,
    });

    await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({ accountId: accountA.id }),
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: faker.number.int({ max: 1000 }) * 1000,
        destinationAccountId: accountB.id,
      },
      raw: true,
    });

    // Now unlink them
    const transactions = await helpers.getTransactions({ raw: true });
    const transferIds = transactions.map((item) => item.transferId);

    const updatedTransactions = await helpers.unlinkTransferTransactions({
      transferIds,
      raw: true,
    });

    // Test that now they're unlinked and not transfer anymore
    updatedTransactions.forEach((tx) => {
      const oppositeTx = transactions.find((item) => item.id === tx.id);

      expect(tx).toEqual({
        ...oppositeTx,
        transferId: null,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      });
    });
  });
  it('unlink external transactions', async () => {
    // Firstly create external expense + income
    await helpers.monobank.pair();
    const { transactions } = await helpers.monobank.mockTransactions();
    const expenseExternalTx = transactions.find((item) => item.transactionType === TRANSACTION_TYPES.expense);
    const incomeExternalTx = transactions.find((item) => item.transactionType === TRANSACTION_TYPES.income);

    // Now create system expense + income
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });

    const [expenseSystemTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({ accountId: accountA.id }),
        transactionType: TRANSACTION_TYPES.expense,
      },
      raw: true,
    });

    const [incomeSystemTx] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({ accountId: accountB.id }),
        transactionType: TRANSACTION_TYPES.income,
      },
      raw: true,
    });

    // Now link 1 external with 1 system for each type
    const [updatedA, updatedB] = await helpers.linkTransactions({
      payload: {
        ids: [
          [expenseExternalTx!.id, incomeSystemTx.id],
          [incomeExternalTx!.id, expenseSystemTx.id],
        ],
      },
      raw: true,
    });

    // Test that after updation only transfer-related fields were changed for each
    // transaction
    expect(expenseExternalTx).toEqual({
      ...updatedA![0],
      transferNature: expect.toBeAnythingOrNull(),
      transferId: expect.toBeAnythingOrNull(),
    });
    expect(incomeSystemTx).toEqual({
      ...updatedA![1],
      transferNature: expect.toBeAnythingOrNull(),
      transferId: expect.toBeAnythingOrNull(),
    });
    expect(incomeExternalTx).toEqual({
      ...updatedB![0],
      transferNature: expect.toBeAnythingOrNull(),
      transferId: expect.toBeAnythingOrNull(),
    });
    expect(expenseSystemTx).toEqual({
      ...updatedB![1],
      transferNature: expect.toBeAnythingOrNull(),
      transferId: expect.toBeAnythingOrNull(),
    });

    // Now unlink all of them
    const transferIds = [...updatedA!, ...updatedB!].map((t) => t.transferId);

    const result = await helpers.unlinkTransferTransactions({
      transferIds,
      raw: true,
    });

    // After unlinking check that transactions now are COMPLETELY SAME
    [expenseExternalTx, incomeExternalTx, expenseSystemTx, incomeSystemTx].forEach((tx) => {
      expect(result.find((t) => t.id === tx!.id)).toEqual(tx);
    });
  });
});
