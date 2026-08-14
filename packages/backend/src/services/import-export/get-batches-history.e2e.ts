import {
  AccountOptionValue,
  CategoryOptionValue,
  CurrencyOptionValue,
  ImportSource,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { expectCsvImportCompleted, waitForCsvImportCompletion } from '@tests/helpers/import-export';

async function runYnabImport() {
  const fileContent = helpers.loadYnabFixture('register-basic.csv');
  const parsed = await helpers.parseYnab({ payload: { fileContent }, raw: true });
  const accountNames = parsed.result.accounts.map((a) => a.originalName);
  const accountMapping = Object.fromEntries(
    parsed.result.accounts.map((a) => [a.originalName, { currencyCode: a.detectedCurrency! }]),
  );
  const { jobId } = await helpers.executeYnab({ payload: { fileContent, accountMapping }, raw: true });

  const deadline = Date.now() + 30_000;
  let status = await helpers.getYnabImportStatus({ jobId, raw: true });
  while (status.status !== 'completed' && status.status !== 'failed' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    status = await helpers.getYnabImportStatus({ jobId, raw: true });
  }
  if (status.status !== 'completed') {
    throw new Error(`Expected completed YNAB import, got status="${status.status}".`);
  }
  return { summary: status.summary, accountNames };
}

describe('GET /import/batches-history', () => {
  const ACCOUNT_COLUMN_VALUE = 'A';

  /** Minimal single-row CSV import, linked to an existing account so no account
   *  gets auto-created — keeps each batch's `accountIds` assertion to one id. */
  async function runCsvImport({ accountId, currencyCode }: { accountId: string; currencyCode: string }) {
    const { jobId } = await helpers.executeImport({
      payload: {
        fileContent: [
          'Date,Amount,Description,Category,Account,Currency,Type',
          `2024-01-15,10.00,Coffee,,${ACCOUNT_COLUMN_VALUE},${currencyCode},expense`,
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
        accountMapping: { [ACCOUNT_COLUMN_VALUE]: { action: 'link-existing', accountId } },
        categoryMapping: {},
        skipDuplicateIndices: [],
      },
      raw: true,
    });
    const progress = await waitForCsvImportCompletion({ jobId });
    expectCsvImportCompleted(progress);
    return progress.summary;
  }

  it('returns an empty list with totalCount 0 for a user with no imports', async () => {
    const result = await helpers.getBatchesHistory({ raw: true });

    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('lists batches from different sources with correct source, count, and accountIds', async () => {
    const account = await helpers.createAccount({ raw: true });
    const csvSummary = await runCsvImport({ accountId: account.id, currencyCode: account.currencyCode });
    const { summary: ynabSummary, accountNames: ynabAccountNames } = await runYnabImport();

    const result = await helpers.getBatchesHistory({ raw: true });

    expect(result.totalCount).toBe(2);
    expect(result.items).toHaveLength(2);

    const csvBatch = result.items.find((b) => b.source === ImportSource.csv)!;
    expect(csvBatch).toBeDefined();
    expect(csvBatch.batchId).toBe(csvSummary.batchId);
    expect(csvBatch.transactionCount).toBe(1);
    expect(csvBatch.accountIds).toEqual([account.id]);

    // Dedicated assertion for the YNAB mislabeling bug fixed alongside this
    // feature: the batch must be tagged `ynab`, not `csv`.
    const ynabBatch = result.items.find((b) => b.source === ImportSource.ynab);
    expect(ynabBatch).toBeDefined();
    // The fixture's one transfer creates two linked rows (both legs stamped with
    // the batch), so the row count is transactions + 2x transfers, not + transfers.
    expect(ynabBatch!.transactionCount).toBe(ynabSummary.transactionsImported + 2 * ynabSummary.transfersImported);

    // Every account the import touched or created — including a transfer's
    // destination account — must show up, not just the source leg's account.
    const allAccounts = await helpers.getAccounts();
    const expectedYnabAccountIds = allAccounts.filter((a) => ynabAccountNames.includes(a.name)).map((a) => a.id);
    expect(expectedYnabAccountIds).toHaveLength(ynabAccountNames.length);
    expect(new Set(ynabBatch!.accountIds)).toEqual(new Set(expectedYnabAccountIds));
  });

  it('paginates: totalCount is populated on the first page and null on later pages', async () => {
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });
    await runCsvImport({ accountId: accountA.id, currencyCode: accountA.currencyCode });
    await runCsvImport({ accountId: accountB.id, currencyCode: accountB.currencyCode });

    const firstPage = await helpers.getBatchesHistory({ payload: { limit: 1, offset: 0 }, raw: true });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.totalCount).toBe(2);

    const secondPage = await helpers.getBatchesHistory({ payload: { limit: 1, offset: 1 }, raw: true });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.totalCount).toBeNull();

    expect(firstPage.items[0]!.batchId).not.toBe(secondPage.items[0]!.batchId);
  });
});
