import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { faker } from '@faker-js/faker';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

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
    const transferIds = transactions.map((item) => item.transferId).filter((id): id is string => id !== null);

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
        updatedAt: expect.toBeAnythingOrNull(),
      });
    });
  });

  it('unlink transactions that were originally out_of_wallet before linking', async () => {
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });

    // Create an out_of_wallet expense
    const [outOfWalletExpense] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountA.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      }),
      raw: true,
    });

    // Create a regular income
    const [regularIncome] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: accountB.id,
        amount: 400,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    // Link them — both become common_transfer
    const linkingResult = await helpers.linkTransactions({
      payload: {
        ids: [[outOfWalletExpense.id, regularIncome.id]],
      },
      raw: true,
    });

    const transferId = linkingResult[0]![0].transferId;
    expect(linkingResult[0]![0].transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    expect(linkingResult[0]![1].transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);

    // Unlink — both should become not_transfer (original out_of_wallet nature is NOT preserved)
    const unlinkedTxs = await helpers.unlinkTransferTransactions({
      transferIds: [transferId],
      raw: true,
    });

    expect(unlinkedTxs).toHaveLength(2);
    unlinkedTxs.forEach((tx) => {
      expect(tx.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.not_transfer);
      expect(tx.transferId).toBeNull();
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
      updatedAt: expect.toBeAnythingOrNull(),
    });
    expect(incomeSystemTx).toEqual({
      ...updatedA![1],
      transferNature: expect.toBeAnythingOrNull(),
      transferId: expect.toBeAnythingOrNull(),
      updatedAt: expect.toBeAnythingOrNull(),
    });
    expect(incomeExternalTx).toEqual({
      ...updatedB![0],
      transferNature: expect.toBeAnythingOrNull(),
      updatedAt: expect.toBeAnythingOrNull(),
      transferId: expect.toBeAnythingOrNull(),
    });
    expect(expenseSystemTx).toEqual({
      ...updatedB![1],
      transferNature: expect.toBeAnythingOrNull(),
      transferId: expect.toBeAnythingOrNull(),
      updatedAt: expect.toBeAnythingOrNull(),
    });

    // Now unlink all of them
    const transferIds = [...updatedA!, ...updatedB!].map((t) => t.transferId).filter((id): id is string => id !== null);

    const result = await helpers.unlinkTransferTransactions({
      transferIds,
      raw: true,
    });

    // After unlinking check that transactions now are COMPLETELY SAME (except updatedAt)
    [expenseExternalTx, incomeExternalTx, expenseSystemTx, incomeSystemTx].forEach((tx) => {
      expect(result.find((t) => t.id === tx!.id)).toEqual({
        ...tx,
        updatedAt: expect.toBeAnythingOrNull(),
      });
    });
  });
});
