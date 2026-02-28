import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import Accounts from '@models/Accounts.model';
import Transactions from '@models/Transactions.model';
import * as helpers from '@tests/helpers';
import { getMockedWalutomatBalances, getMockedWalutomatHistory } from '@tests/mocks/walutomat/data';
import {
  VALID_WALUTOMAT_API_KEY,
  VALID_WALUTOMAT_PRIVATE_KEY,
  getWalutomatBalancesMock,
  getWalutomatHistoryMock,
} from '@tests/mocks/walutomat/mock-api';

/**
 * Creates a Walutomat connection WITHOUT connecting accounts or triggering sync.
 * This allows tests to set up mocks before any sync happens.
 */
const pairWalutomatUser = async ({
  apiKey = VALID_WALUTOMAT_API_KEY,
  privateKey = VALID_WALUTOMAT_PRIVATE_KEY,
}: {
  apiKey?: string;
  privateKey?: string;
} = {}) => {
  const { connectionId } = await helpers.bankDataProviders.connectProvider({
    providerType: BANK_PROVIDER_TYPE.WALUTOMAT,
    credentials: { apiKey, privateKey },
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
 * Set up mocks, connect external accounts, and return the first created account with transactions.
 */
async function connectAccountsAndSync({
  connectionId,
  mockedHistory,
  accountExternalIds,
}: {
  connectionId: number;
  mockedHistory: ReturnType<typeof getMockedWalutomatHistory>;
  accountExternalIds?: string[];
}): Promise<{ account: Accounts; transactions: Transactions[] }> {
  global.mswMockServer.use(getWalutomatHistoryMock({ response: mockedHistory }), getWalutomatBalancesMock());

  const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
    connectionId,
    raw: true,
  });

  const idsToConnect = accountExternalIds || externalAccounts.map((acc) => acc.externalId);

  const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
    connectionId,
    accountExternalIds: idsToConnect,
    raw: true,
  });

  const account = await Accounts.findByPk(syncedAccounts[0]!.id);
  const transactions = await getTransactions();

  return { account: account!, transactions };
}

/**
 * Creates a Walutomat connection, connects accounts, and syncs transactions
 * with mocked data. Returns the created account and its transactions.
 */
const addTransactions = async ({
  amount = 5,
  currency = 'EUR',
}: {
  amount?: number;
  currency?: string;
} = {}): Promise<{
  account: Accounts;
  transactions: Transactions[];
}> => {
  const mockedHistory = getMockedWalutomatHistory({ amount, currency });

  const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
  const existingConnection = connections.find(
    (c: { providerType: string }) => c.providerType === BANK_PROVIDER_TYPE.WALUTOMAT,
  );

  if (!existingConnection) {
    const { connectionId } = await pairWalutomatUser();
    return connectAccountsAndSync({
      connectionId,
      mockedHistory,
      accountExternalIds: [`wallet-${currency.toLowerCase()}`],
    });
  }

  const connectionId = existingConnection.id;

  const { connection } = await helpers.bankDataProviders.getConnectionDetails({
    connectionId,
    raw: true,
  });

  if (connection.accounts.length === 0) {
    return connectAccountsAndSync({
      connectionId,
      mockedHistory,
      accountExternalIds: [`wallet-${currency.toLowerCase()}`],
    });
  }

  const account = await Accounts.findByPk(connection.accounts[0]!.id);

  if (!account) {
    throw new Error('Account not found after pairing');
  }

  global.mswMockServer.use(getWalutomatHistoryMock({ response: mockedHistory }), getWalutomatBalancesMock());

  await helpers.bankDataProviders.syncTransactionsForAccount({
    connectionId,
    accountId: account.id,
    raw: true,
  });

  const transactions = await getTransactions();

  return { account, transactions };
};

export default {
  pair: pairWalutomatUser,
  getTransactions,
  mockTransactions: addTransactions,
  mockedBalancesData: getMockedWalutomatBalances,
  mockedHistoryData: getMockedWalutomatHistory,
  mockedApiKey: VALID_WALUTOMAT_API_KEY,
  mockedPrivateKey: VALID_WALUTOMAT_PRIVATE_KEY,
};
