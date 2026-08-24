import {
  AccountOptionValue,
  type AutomationConditions,
  CategoryOptionValue,
  CurrencyOptionValue,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TransactionTypeOptionValue,
  asDecimal,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import type { LunchFlowApiTransaction } from '@services/bank-data-providers/lunchflow/types';
import * as helpers from '@tests/helpers';
import { expectCsvImportCompleted, waitForCsvImportCompletion } from '@tests/helpers/import-export';
import { getLunchFlowBalanceMock, getLunchFlowTransactionsMock } from '@tests/mocks/lunchflow/mock-api';
import { subDays } from 'date-fns';

const now = new Date();
const daysAgo = (offset: number) => subDays(now, offset);

const bankRow = ({
  amount,
  date,
  description,
}: {
  amount: number;
  date: Date;
  description: string;
}): LunchFlowApiTransaction => ({
  id: `lf-${description}-${date.getTime()}`,
  accountId: 1001,
  amount: asDecimal(amount),
  currency: 'USD',
  date: date.toISOString(),
  merchant: description,
  description,
  isPending: false,
});

/** Synced rows: a non-system account, which is the `sync` half of the eligibility predicate. */
const syncBankRows = async ({ transactions }: { transactions: LunchFlowApiTransaction[] }) => {
  const { connectionId } = await helpers.lunchflow.pair();

  global.mswMockServer.use(
    getLunchFlowTransactionsMock({ response: { transactions, total: transactions.length } }),
    getLunchFlowBalanceMock(),
  );

  const { accounts } = await helpers.bankDataProviders.listExternalAccounts({ connectionId, raw: true });
  const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
    connectionId,
    accountExternalIds: [accounts[0]!.externalId],
    raw: true,
  });

  return { account: syncedAccounts[0]!, connectionId, externalAccountId: accounts[0]!.externalId };
};

/** Imported rows: a system account carrying `externalData.importDetails`, the `import` half. */
const importCsvRows = async ({
  accountId,
  currencyCode,
  rows,
}: {
  accountId: string;
  currencyCode: string;
  rows: { date: string; amount: number; description: string }[];
}) => {
  const { jobId } = await helpers.executeImport({
    payload: {
      fileContent: [
        'Date,Amount,Description,Category,Account,Currency,Type',
        ...rows.map((row) => `${row.date},${row.amount},${row.description},,A,${currencyCode},expense`),
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
};

const preview = (conditions: AutomationConditions) => helpers.previewAutomation({ payload: { conditions }, raw: true });

describe('POST /automations/preview', () => {
  it('counts matches over the eligible rows and returns the 5 most recent', async () => {
    await syncBankRows({
      transactions: [
        ...Array.from({ length: 7 }, (_, index) =>
          bankRow({ amount: -10 - index, date: daysAgo(index + 1), description: `Uber ride ${index + 1}` }),
        ),
        ...Array.from({ length: 3 }, (_, index) =>
          bankRow({ amount: -20, date: daysAgo(index + 8), description: `Grocery ${index + 1}` }),
        ),
      ],
    });

    const manualAccount = await helpers.createAccount({ raw: true });
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: manualAccount.id, note: 'Uber ride manual' }),
      raw: true,
    });

    const result = await preview({
      match: 'all',
      items: [{ field: 'note', operator: 'contains_any', value: ['uber'] }],
    });

    expect(result.scannedCount).toBe(10);
    expect(result.matchedCount).toBe(7);
    expect(result.matches.map((match) => match.note)).toEqual([
      'Uber ride 1',
      'Uber ride 2',
      'Uber ride 3',
      'Uber ride 4',
      'Uber ride 5',
    ]);
    expect(result.matches[0]).toMatchObject({
      currencyCode: 'USD',
      amount: 10,
      transactionType: TRANSACTION_TYPES.expense,
    });
  });

  it('narrows the scan to the accounts an `all` rule can apply to', async () => {
    await syncBankRows({
      transactions: [
        bankRow({ amount: -10, date: daysAgo(1), description: 'Uber ride' }),
        bankRow({ amount: -20, date: daysAgo(2), description: 'Coffee at the airport' }),
      ],
    });

    const importAccount = await helpers.createAccount({ raw: true });
    await importCsvRows({
      accountId: importAccount.id,
      currencyCode: importAccount.currencyCode,
      rows: [
        { date: '2024-01-15', amount: 10, description: 'Coffee' },
        { date: '2024-01-16', amount: 20, description: 'Lunch' },
      ],
    });

    const result = await preview({
      match: 'all',
      items: [
        { field: 'account', operator: 'in', value: [importAccount.id] },
        { field: 'note', operator: 'contains_any', value: ['coffee'] },
      ],
    });

    expect(result.scannedCount).toBe(2);
    expect(result.matchedCount).toBe(1);
    expect(result.matches.map((match) => match.note)).toEqual(['Coffee']);
    expect(result.matches[0]!.accountId).toBe(importAccount.id);
  });

  it('scans every eligible row under `any` and matches on either item', async () => {
    await syncBankRows({
      transactions: [
        bankRow({ amount: -10, date: daysAgo(1), description: 'Uber ride' }),
        bankRow({ amount: -20, date: daysAgo(2), description: 'Grocery' }),
      ],
    });

    const importAccount = await helpers.createAccount({ raw: true });
    await importCsvRows({
      accountId: importAccount.id,
      currencyCode: importAccount.currencyCode,
      rows: [{ date: '2024-01-15', amount: 10, description: 'Coffee' }],
    });

    const result = await preview({
      match: 'any',
      items: [
        { field: 'note', operator: 'contains_any', value: ['uber'] },
        { field: 'account', operator: 'in', value: [importAccount.id] },
      ],
    });

    expect(result.scannedCount).toBe(3);
    expect(result.matchedCount).toBe(2);
    expect(result.matches.map((match) => match.note)).toEqual(['Uber ride', 'Coffee']);
  });

  it('compares an amount bound against the transaction currency', async () => {
    await syncBankRows({
      transactions: [
        bankRow({ amount: 150, date: daysAgo(1), description: 'Salary top-up' }),
        bankRow({ amount: 50, date: daysAgo(2), description: 'Refund' }),
        bankRow({ amount: -200, date: daysAgo(3), description: 'Rent' }),
      ],
    });

    const result = await preview({
      match: 'all',
      items: [
        { field: 'transactionType', operator: 'equals', value: TRANSACTION_TYPES.income },
        { field: 'amount', operator: 'gte', value: { min: 100 }, currency: { mode: 'transaction' } },
      ],
    });

    expect(result.scannedCount).toBe(2);
    expect(result.matchedCount).toBe(1);
    expect(result.matches.map((match) => match.note)).toEqual(['Salary top-up']);
  });

  it('treats a specific currency as a filter, never converting other currencies', async () => {
    await syncBankRows({
      transactions: [bankRow({ amount: -100, date: daysAgo(1), description: 'USD row' })],
    });

    const inUsd = await preview({
      match: 'all',
      items: [{ field: 'amount', operator: 'gte', value: { min: 1 }, currency: { mode: 'specific', code: 'USD' } }],
    });
    const inEur = await preview({
      match: 'all',
      items: [{ field: 'amount', operator: 'gte', value: { min: 1 }, currency: { mode: 'specific', code: 'EUR' } }],
    });

    expect(inUsd.matchedCount).toBe(1);
    expect(inEur).toEqual({ matchedCount: 0, scannedCount: 1, matches: [] });
  });

  it('matches a single UTC calendar day', async () => {
    const dates = [daysAgo(1), daysAgo(2), daysAgo(3)];
    await syncBankRows({
      transactions: dates.map((date, index) => bankRow({ amount: -10, date, description: `Row ${index}` })),
    });

    const targetDay = dates[1]!.getUTCDate();
    const result = await preview({
      match: 'all',
      items: [{ field: 'dayOfMonth', operator: 'between', value: { min: targetDay, max: targetDay } }],
    });

    expect(result.scannedCount).toBe(3);
    expect(result.matchedCount).toBe(1);
    expect(result.matches.map((match) => match.note)).toEqual(['Row 1']);
  });

  it('still scans synced rows after the account was unlinked and relinked', async () => {
    const { account, connectionId, externalAccountId } = await syncBankRows({
      transactions: [bankRow({ amount: -10, date: daysAgo(1), description: 'Survivor' })],
    });

    await helpers.unlinkAccountFromBankConnection({ id: account.id, raw: true });
    await helpers.linkAccountToBankConnection({ id: account.id, connectionId, externalAccountId, raw: true });

    const result = await preview({
      match: 'all',
      items: [{ field: 'account', operator: 'in', value: [account.id] }],
    });

    expect(result.scannedCount).toBe(1);
    expect(result.matchedCount).toBe(1);
  });

  it('returns zeros for a user with no eligible rows', async () => {
    const result = await preview({
      match: 'all',
      items: [{ field: 'note', operator: 'contains_any', value: ['uber'] }],
    });

    expect(result).toEqual({ matchedCount: 0, scannedCount: 0, matches: [] });
  });

  it('rejects an empty condition list', async () => {
    const response = await helpers.previewAutomation({ payload: { conditions: { match: 'all', items: [] } } });

    expect(response.statusCode).toBe(422);
  });

  it('scans the synced and imported rows only, skipping manual, planned, transfer and adjustment rows', async () => {
    await syncBankRows({
      transactions: [
        bankRow({ amount: -10, date: daysAgo(1), description: 'Synced one' }),
        bankRow({ amount: -20, date: daysAgo(2), description: 'Synced two' }),
        bankRow({ amount: -30, date: daysAgo(3), description: 'Synced three' }),
      ],
    });

    const systemAccount = await helpers.createAccount({ raw: true });
    const transferTarget = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ name: 'transfer target' }),
      raw: true,
    });

    await importCsvRows({
      accountId: systemAccount.id,
      currencyCode: systemAccount.currencyCode,
      rows: [
        { date: '2024-01-15', amount: 10, description: 'Imported one' },
        { date: '2024-01-16', amount: 20, description: 'Imported two' },
      ],
    });

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: systemAccount.id, note: 'Manual' }),
      raw: true,
    });
    await helpers.createPlannedTransaction({
      payload: { accountId: systemAccount.id, note: 'Planned', time: daysAgo(20).toISOString() },
      raw: true,
    });
    await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({ accountId: systemAccount.id, amount: 5000, note: 'Transfer' }),
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: 5000,
        destinationAccountId: transferTarget.id,
      },
      raw: true,
    });
    await helpers.balanceAdjustment({ id: systemAccount.id, payload: { targetBalance: asDecimal(999) }, raw: true });

    const result = await preview({
      match: 'all',
      items: [{ field: 'dayOfMonth', operator: 'between', value: { min: 1, max: 31 } }],
    });

    expect(result.scannedCount).toBe(5);
    expect(result.matchedCount).toBe(5);
    expect(result.matches.map((match) => match.note)).toEqual([
      'Synced one',
      'Synced two',
      'Synced three',
      'Imported two',
      'Imported one',
    ]);
  });
});
