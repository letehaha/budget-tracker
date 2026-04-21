import { BANK_PROVIDER_TYPE, ExternalMonobankTransactionResponse, asCents } from '@bt/shared/types';
import { until } from '@common/helpers';
import { faker } from '@faker-js/faker';
import Accounts from '@models/accounts.model';
import Transactions from '@models/transactions.model';
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

  let connectionId: number;
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

      // Wait for auto-sync to complete via BullMQ — poll until all expected transactions are synced
      const pollAccountId = account!.id;
      await until(
        async () => {
          const txs = await getTransactions();
          return txs.filter((t: { accountId: number }) => t.accountId === pollAccountId).length >= amount;
        },
        { timeout: 30000, interval: 500 },
      );

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

    // Wait for auto-sync to complete via BullMQ — poll until monobank account has transactions
    const accountIdForPoll = account!.id;
    await until(
      async () => {
        const txs = await getTransactions();
        return txs.some((t: { accountId: number }) => t.accountId === accountIdForPoll);
      },
      { timeout: 15000, interval: 300 },
    );

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

  // Wait for BullMQ worker to process all expected transactions for this specific account
  const targetAccountId = account.id;
  await until(
    async () => {
      const txs = await getTransactions();
      return txs.filter((t: { accountId: number }) => t.accountId === targetAccountId).length >= amount;
    },
    { timeout: 30000, interval: 500 },
  );

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
