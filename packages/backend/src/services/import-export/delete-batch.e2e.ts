import {
  AccountOptionValue,
  CategoryOptionValue,
  CurrencyOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { expectCsvImportCompleted, waitForCsvImportCompletion } from '@tests/helpers/import-export';
import { asUser, signUpSecondUser, withoutSession } from '@tests/helpers/share';

/** Two-row CSV import linked to an existing account so no account gets auto-created. */
async function runCsvImport({
  accountId,
  currencyCode,
  recalculateBalance = false,
}: {
  accountId: string;
  currencyCode: string;
  /** Whether the import should apply its rows' net effect onto the account's
   *  current balance (mirrors the real "import new transactions" case) instead
   *  of leaving the balance untouched (the default "backfill history" case). */
  recalculateBalance?: boolean;
}) {
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
      recalculateBalance,
    },
    raw: true,
  });
  const progress = await waitForCsvImportCompletion({ jobId });
  expectCsvImportCompleted(progress);
  return progress.summary;
}

describe('DELETE /import/batch/:batchId', () => {
  it('deletes every transaction of the batch and restores the account balance', async () => {
    const account = await helpers.createAccount({ raw: true });
    const balanceBeforeImport = account.currentBalance;

    const summary = await runCsvImport({
      accountId: account.id,
      currencyCode: account.currencyCode,
      recalculateBalance: true,
    });

    const result = await helpers.deleteImportBatch({ batchId: summary.batchId, raw: true });
    expect(result.deletedCount).toBe(2);
    expect(result.deletedIds.toSorted()).toEqual(summary.newTransactionIds.toSorted());

    const remaining = await helpers.getTransactions({ batchId: summary.batchId, raw: true });
    expect(remaining).toHaveLength(0);

    const accountAfterDelete = (await helpers.getAccounts()).find((a) => a.id === account.id)!;
    expect(accountAfterDelete.currentBalance).toBe(balanceBeforeImport);
  });

  it('returns 404 for a batchId with no matching transactions', async () => {
    const response = await helpers.deleteImportBatch({ batchId: '00000000-0000-0000-0000-000000000000' });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a non-uuid batchId', async () => {
    const response = await helpers.deleteImportBatch({ batchId: 'not-a-uuid' });

    expect(response.statusCode).toBe(422);
  });

  it('returns 401 for an unauthenticated request', async () => {
    const response = await withoutSession(() =>
      helpers.deleteImportBatch({ batchId: '00000000-0000-0000-0000-000000000000' }),
    );

    expect(response.statusCode).toBe(401);
  });

  it("never deletes another user's batch, even when the batchId is known", async () => {
    const account = await helpers.createAccount({ raw: true });
    const summary = await runCsvImport({ accountId: account.id, currencyCode: account.currencyCode });

    const otherUser = await signUpSecondUser();
    const otherResponse = await asUser({
      cookies: otherUser.cookies,
      fn: () => helpers.deleteImportBatch({ batchId: summary.batchId }),
    });
    expect(otherResponse.statusCode).toBe(404);

    // The owner's transactions must still be there — the other user's attempt was a no-op.
    const stillThere = await helpers.getTransactions({ batchId: summary.batchId, raw: true });
    expect(stillThere).toHaveLength(2);
  });
});
