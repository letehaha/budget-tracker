import {
  AccountOptionValue,
  CategoryOptionValue,
  CurrencyOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { expectCsvImportCompleted, waitForCsvImportCompletion } from '@tests/helpers/import-export';
import { asUser, signUpSecondUser } from '@tests/helpers/share';

async function runCsvImport({ accountId, currencyCode }: { accountId: string; currencyCode: string }) {
  const { jobId } = await helpers.executeImport({
    payload: {
      fileContent: [
        'Date,Amount,Description,Category,Account,Currency,Type',
        `2024-01-15,10.00,Coffee,,A,${currencyCode},expense`,
        `2024-01-16,20.00,Lunch,,A,${currencyCode},expense`,
      ].join('\n'),
      delimiter: ',',
      columnMapping: {
        date: 'Date',
        dateFieldOrder: 'month-first',
        amount: 'Amount',
        description: 'Description',
        category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
        currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
        transactionType: {
          option: TransactionTypeOptionValue.dataSourceColumn,
          columnName: 'Type',
          incomeValues: ['income'],
          expenseValues: ['expense'],
        },
        account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
      },
      accountMapping: { A: { action: 'link-existing', accountId } },
      categoryMapping: {},
      skipDuplicateIndices: [],
    },
    raw: true,
  });
  const progress = await waitForCsvImportCompletion({ jobId });
  expectCsvImportCompleted(progress);
  return progress.summary;
}

describe('GET /transactions — batchId filter', () => {
  it('returns only the transactions created by one import batch', async () => {
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });
    const batchA = await runCsvImport({ accountId: accountA.id, currencyCode: accountA.currencyCode });
    const batchB = await runCsvImport({ accountId: accountB.id, currencyCode: accountB.currencyCode });

    const filtered = await helpers.getTransactions({ batchId: batchA.batchId, raw: true });

    expect(filtered).toHaveLength(2);
    expect(filtered.map((tx) => tx.id).toSorted()).toEqual(batchA.newTransactionIds.toSorted());
    expect(filtered.some((tx) => batchB.newTransactionIds.includes(tx.id))).toBe(false);
  });

  it('returns an empty list for a batchId with no matching transactions', async () => {
    const account = await helpers.createAccount({ raw: true });
    await runCsvImport({ accountId: account.id, currencyCode: account.currencyCode });

    const filtered = await helpers.getTransactions({ batchId: '00000000-0000-0000-0000-000000000000', raw: true });

    expect(filtered).toHaveLength(0);
  });

  it('rejects a non-uuid batchId', async () => {
    const response = await helpers.getTransactions({ batchId: 'not-a-uuid' });

    expect(response.statusCode).toBe(422);
  });

  it("does not return another user's batch, even when the batchId is known", async () => {
    const account = await helpers.createAccount({ raw: true });
    const batch = await runCsvImport({ accountId: account.id, currencyCode: account.currencyCode });

    const otherUser = await signUpSecondUser();
    const filteredAsOther = await asUser({
      cookies: otherUser.cookies,
      fn: () => helpers.getTransactions({ batchId: batch.batchId, raw: true }),
    });

    expect(filteredAsOther).toHaveLength(0);
  });
});
