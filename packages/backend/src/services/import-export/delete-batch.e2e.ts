import {
  AccountOptionValue,
  BANK_PROVIDER_TYPE,
  CategoryOptionValue,
  CurrencyOptionValue,
  TransactionTypeOptionValue,
  asDecimal,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { expectCsvImportCompleted, waitForCsvImportCompletion } from '@tests/helpers/import-export';
import { asUser, signUpSecondUser, withoutSession } from '@tests/helpers/share';
import { getMockedLunchFlowTransactions } from '@tests/mocks/lunchflow/data';
import {
  VALID_LUNCHFLOW_API_KEY,
  getLunchFlowBalanceMock,
  getLunchFlowTransactionsMock,
} from '@tests/mocks/lunchflow/mock-api';

/** LunchFlow's mock account id used across the bank-data-provider test fixtures. */
const LUNCHFLOW_EXTERNAL_ACCOUNT_ID = '1001';

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

  it('is a no-op success for a batchId with no matching transactions', async () => {
    const result = await helpers.deleteImportBatch({
      batchId: '00000000-0000-0000-0000-000000000000',
      raw: true,
    });

    expect(result).toEqual({ deletedCount: 0, deletedIds: [] });
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
    const otherResult = await asUser({
      cookies: otherUser.cookies,
      fn: () => helpers.deleteImportBatch({ batchId: summary.batchId, raw: true }),
    });
    // Scoped to the caller, so another user's batchId resolves as the no-op
    // success case (see the "no matching transactions" test above) — not a leak.
    expect(otherResult).toEqual({ deletedCount: 0, deletedIds: [] });

    // The owner's transactions must still be there — the other user's attempt was a no-op.
    const stillThere = await helpers.getTransactions({ batchId: summary.batchId, raw: true });
    expect(stillThere).toHaveLength(2);
  });

  it('rejects undoing a batch whose account was later connected to a bank', async () => {
    await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ currencyCode: 'USD' }),
      raw: true,
    });
    const summary = await runCsvImport({ accountId: account.id, currencyCode: 'USD' });

    const { connectionId } = await helpers.bankDataProviders.connectProvider({
      providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
      credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
      raw: true,
    });
    global.mswMockServer.use(
      getLunchFlowTransactionsMock({
        response: getMockedLunchFlowTransactions(0),
        accountId: LUNCHFLOW_EXTERNAL_ACCOUNT_ID,
      }),
      getLunchFlowBalanceMock({
        accountId: LUNCHFLOW_EXTERNAL_ACCOUNT_ID,
        response: { balance: { amount: asDecimal(0), currency: 'USD' } },
      }),
    );
    const linkResponse = await helpers.linkAccountToBankConnection({
      id: account.id,
      connectionId,
      externalAccountId: LUNCHFLOW_EXTERNAL_ACCOUNT_ID,
      raw: false,
    });
    expect(linkResponse.statusCode).toBe(200);

    const response = await helpers.deleteImportBatch({ batchId: summary.batchId });
    expect(response.statusCode).toBe(422);

    // Blocked before deletion, not partially applied.
    const stillThere = await helpers.getTransactions({ batchId: summary.batchId, raw: true });
    expect(stillThere).toHaveLength(2);
  });
});
