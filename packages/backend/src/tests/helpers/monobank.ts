import { BANK_PROVIDER_TYPE, asCents } from '@bt/shared/types';
import type { RecordId, ExternalMonobankTransactionResponse } from '@bt/shared/types';
import { until } from '@common/helpers';
import { faker } from '@faker-js/faker';
import Accounts from '@models/accounts.model';
import type Transactions from '@models/transactions.model';
import * as helpers from '@tests/helpers';
import { getMockedClientData } from '@tests/mocks/monobank/data';
import { VALID_MONOBANK_TOKEN, getMonobankTransactionsMock } from '@tests/mocks/monobank/mock-api';
import { subDays } from 'date-fns';

const getMockedTransactionData = (
  amount = 1,
  { initialBalance }: { initialBalance?: number } = {},
): ExternalMonobankTransactionResponse[] => {
  const currentDate = helpers.randomDate();
  // To make balance change realistic, we store initial one here and the sub below
  let initialAccountBalance = initialBalance ?? faker.number.int({ min: 10000, max: 9999999 });

  return Array.from({ length: amount }, (_, index) => {
    const txAmount = faker.number.int({ min: 1000, max: 99999 });
    // Make expenses and incomes
    const realisticAmount = index % 3 ? txAmount : txAmount * -1;
    const newBalance = (initialAccountBalance = initialAccountBalance + realisticAmount);

    return {
      id: faker.string.uuid(),
      time: Math.abs(subDays(currentDate, index).getTime() / 1000),
      description: '',
      mcc: faker.number.int(300),
      originalMcc: faker.number.int(300),
      hold: false,
      amount: asCents(realisticAmount),
      operationAmount: asCents(faker.number.int(10000)),
      currencyCode: faker.number.int({ min: 10, max: 999 }),
      commissionRate: asCents(0),
      cashbackAmount: asCents(0),
      balance: asCents(newBalance),
      comment: '',
      receiptId: '',
      invoiceId: '',
      counterEdrpou: '',
      counterIban: '',
      counterName: '',
      __mocked: true,
    };
  });
};

/**
 * Creates a Monobank connection WITHOUT connecting accounts or triggering sync.
 * This allows tests to set up mocks before any sync happens.
 * Use mockTransactions() after pair() to actually sync transactions with mocked data.
 */
const pairMonobankUser = async (token: string = VALID_MONOBANK_TOKEN) => {
  // Only create the connection - don't connect accounts yet
  // This avoids triggering auto-sync before tests can set up mocks
  const { connectionId } = await helpers.bankDataProviders.connectProvider({
    providerType: BANK_PROVIDER_TYPE.MONOBANK,
    credentials: { apiToken: token },
    raw: true,
  });

  return { connectionId };
};

const getTransactions = async () => {
  return helpers.extractResponse(
    await helpers.makeRequest({
      method: 'get',
      url: '/transactions',
    }),
  );
};

/**
 * Wait until a monobank account's synced transaction count reaches `minCount` AND stops
 * changing across consecutive polls. The BullMQ sync runs asynchronously and can land more
 * rows than the initial batch shortly after the first ones, so a bare `>= minCount` check may
 * snapshot mid-sync and yield a flaky baseline. Waiting for the count to stabilize gives a
 * complete, deterministic baseline — this replaces a fixed `sleep` that was reliable only
 * because it over-waited.
 */
const waitForSyncToSettle = async (accountId: RecordId, minCount: number): Promise<void> => {
  let lastCount = -1;
  await until(
    async () => {
      const txs = await getTransactions();
      const count = txs.filter((t: { accountId: RecordId | null }) => t.accountId === accountId).length;
      const settled = count >= minCount && count === lastCount;
      lastCount = count;
      return settled;
    },
    { timeout: 30000, interval: 500 },
  );
};

const addTransactions = async ({ amount = 10 }: { amount?: number } = {}): Promise<{
  account: Accounts;
  transactions: Transactions[];
}> => {
  // Generate mocked transactions data first (we'll use initial balance later if account exists)
  let mockedTransactions = getMockedTransactionData(amount);

  // Check if there's already a connected Monobank connection
  const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
  const existingConnection = connections.find(
    (c: { providerType: string }) => c.providerType === BANK_PROVIDER_TYPE.MONOBANK,
  );

  let connectionId: string;
  let account: Accounts | null;

  if (existingConnection) {
    // Use existing connection
    connectionId = existingConnection.id;

    // Get existing accounts for this connection
    const { connection } = await helpers.bankDataProviders.getConnectionDetails({
      connectionId,
      raw: true,
    });

    if (connection.accounts.length > 0) {
      // Accounts already connected - just get the account and sync with mocked data
      account = await Accounts.findByPk(connection.accounts[0]!.id);

      if (account) {
        // Regenerate mocked transactions with correct initial balance
        mockedTransactions = getMockedTransactionData(amount, {
          initialBalance: account.initialBalance.toCents(),
        });
      }
    } else {
      // Connection exists but no accounts - set up mock BEFORE connecting
      // because connectSelectedAccounts triggers auto-sync
      global.mswMockServer.use(getMonobankTransactionsMock({ response: mockedTransactions }));

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: externalAccounts.map((acc) => acc.externalId),
        raw: true,
      });
      account = await Accounts.findByPk(syncedAccounts[0]!.id);

      // Wait for the BullMQ auto-sync to fully settle before snapshotting the baseline.
      await waitForSyncToSettle(account!.id, amount);

      const transactions = await getTransactions();
      return { account: account!, transactions };
    }
  } else {
    // No existing connection - create connection, set up mock, then connect accounts
    const { connectionId: newConnectionId } = await pairMonobankUser();
    connectionId = newConnectionId;

    // Set up mock BEFORE connecting accounts (auto-sync uses this mock)
    global.mswMockServer.use(getMonobankTransactionsMock({ response: mockedTransactions }));

    const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
      connectionId,
      raw: true,
    });
    const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
      connectionId,
      accountExternalIds: externalAccounts.map((acc) => acc.externalId),
      raw: true,
    });
    account = await Accounts.findByPk(syncedAccounts[0]!.id);

    // Wait for the BullMQ auto-sync to fully settle before snapshotting the baseline.
    await waitForSyncToSettle(account!.id, amount);

    const transactions = await getTransactions();
    return { account: account!, transactions };
  }

  if (!account) {
    throw new Error('Account not found after pairing');
  }

  // For existing accounts, set up mock and trigger sync explicitly
  global.mswMockServer.use(getMonobankTransactionsMock({ response: mockedTransactions }));

  // Trigger transaction sync
  await helpers.bankDataProviders.syncTransactionsForAccount({
    connectionId,
    accountId: account.id,
    raw: true,
  });

  // Wait for the BullMQ sync to fully settle before snapshotting the baseline.
  await waitForSyncToSettle(account.id, amount);

  const transactions = await getTransactions();

  return { account, transactions };
};

export default {
  pair: pairMonobankUser,
  getTransactions,
  mockTransactions: addTransactions,
  mockedClientData: getMockedClientData,
  mockedTransactionData: getMockedTransactionData,
  mockedToken: VALID_MONOBANK_TOKEN,
};
