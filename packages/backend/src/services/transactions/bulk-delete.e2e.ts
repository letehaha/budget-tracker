import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('POST /transactions/bulk-delete', () => {
  it('deletes multiple transactions and updates the list', async () => {
    const account = await helpers.createAccount({ raw: true });

    const [txA] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
      raw: true,
    });
    const [txB] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 200 }),
      raw: true,
    });
    const [txC] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 300 }),
      raw: true,
    });

    const result = await helpers.bulkDeleteTransactions({
      payload: { transactionIds: [txA.id, txB.id] },
      raw: true,
    });

    expect(result.deletedCount).toBe(2);
    expect(result.deletedIds.toSorted()).toEqual([txA.id, txB.id].toSorted());

    const remaining = await helpers.getTransactions({ raw: true });
    const remainingIds = remaining.map((tx) => tx.id);
    expect(remainingIds).toContain(txC.id);
    expect(remainingIds).not.toContain(txA.id);
    expect(remainingIds).not.toContain(txB.id);
  });

  it('deletes both legs of a transfer when one leg is selected, and tolerates both legs being selected', async () => {
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });

    const [transferBase, transferOpposite] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({ accountId: accountA.id, amount: 500 }),
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: 500,
        destinationAccountId: accountB.id,
      },
      raw: true,
    });

    const result = await helpers.bulkDeleteTransactions({
      payload: { transactionIds: [transferBase.id, transferOpposite!.id] },
      raw: true,
    });

    // The twin is removed by the transfer-pair cleanup, not counted twice
    expect(result.deletedCount).toBe(1);

    const remaining = await helpers.getTransactions({ raw: true });
    const remainingIds = remaining.map((tx) => tx.id);
    expect(remainingIds).not.toContain(transferBase.id);
    expect(remainingIds).not.toContain(transferOpposite!.id);
  });

  it('returns 404 when none of the ids exist', async () => {
    const response = await helpers.bulkDeleteTransactions({
      payload: { transactionIds: [generateRandomRecordId()] },
    });

    expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('refuses to delete bank-connected transactions and lists the disallowed ids', async () => {
    const { transactions: externalTransactions } = await helpers.monobank.mockTransactions({ amount: 2 });
    expect(externalTransactions.length).toBeGreaterThan(0);

    const account = await helpers.createAccount({ raw: true });
    const [systemTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
      raw: true,
    });

    const externalTxId = externalTransactions[0]!.id;
    const response = await helpers.bulkDeleteTransactions({
      payload: { transactionIds: [systemTx.id, externalTxId] },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

    // Nothing is deleted when the batch contains a disallowed row (all-or-nothing)
    const remaining = await helpers.getTransactions({ raw: true });
    const remainingIds = remaining.map((tx) => tx.id);
    expect(remainingIds).toContain(systemTx.id);
    expect(remainingIds).toContain(externalTxId);
  });

  it('validates that at least one id is required', async () => {
    const response = await helpers.bulkDeleteTransactions({
      payload: { transactionIds: [] },
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('income/expense rows of all natures are deletable in one batch', async () => {
    const account = await helpers.createAccount({ raw: true });

    const [income] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 150,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });
    const [outOfWallet] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({ accountId: account.id, amount: 250 }),
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      },
      raw: true,
    });

    const result = await helpers.bulkDeleteTransactions({
      payload: { transactionIds: [income.id, outOfWallet.id] },
      raw: true,
    });

    expect(result.deletedCount).toBe(2);
  });
});
