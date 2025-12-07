import { BANK_PROVIDER_TYPE, ExternalMonobankTransactionResponse } from '@bt/shared/types';
import { faker } from '@faker-js/faker';
import Accounts from '@models/Accounts.model';
import Transactions from '@models/Transactions.model';
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

  return new Array(amount).fill(0).map((_, index) => {
    const amount = faker.number.int({ min: 1000, max: 99999 });
    // Make expenses and incomes
    const realisticAmount = index % 3 ? amount : amount * -1;
    const newBalance = (initialAccountBalance = initialAccountBalance + realisticAmount);

    return {
      id: faker.string.uuid(),
      time: Math.abs(subDays(currentDate, index).getTime() / 1000),
      description: '',
      mcc: faker.number.int(300),
      originalMcc: faker.number.int(300),
      hold: false,
      amount: realisticAmount,
      operationAmount: faker.number.int(10000),
      currencyCode: faker.number.int({ min: 10, max: 999 }),
      commissionRate: 0,
      cashbackAmount: 0,
      balance: newBalance,
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
 * Pairs and connects Monobank accounts using the new unified bank data provider flow
 */
const pairMonobankUser = async (token: string = VALID_MONOBANK_TOKEN) => {
  // Step 1: Connect provider
  const { connectionId } = await helpers.bankDataProviders.connectProvider({
    providerType: BANK_PROVIDER_TYPE.MONOBANK,
    credentials: { apiToken: token },
    raw: true,
  });

  // Step 2: List external accounts
  const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
    connectionId,
    raw: true,
  });

  // Step 3: Connect all available accounts
  const accountExternalIds = externalAccounts.map((acc) => acc.externalId);
  const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
    connectionId,
    accountExternalIds,
    raw: true,
  });

  return { connectionId, syncedAccounts };
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
  // Check if there's already a connected Monobank account
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
      account = await Accounts.findByPk(connection.accounts[0]!.id);
    } else {
      // Connection exists but no accounts - connect them
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
    }
  } else {
    // No existing connection - pair from scratch
    const pairResult = await pairMonobankUser();
    connectionId = pairResult.connectionId;
    account = await Accounts.findByPk(pairResult.syncedAccounts[0]!.id);
  }

  if (!account) {
    throw new Error('Account not found after pairing');
  }

  const mockedTransactions = getMockedTransactionData(amount, {
    initialBalance: account.initialBalance,
  });

  // Mock the transaction API response
  global.mswMockServer.use(getMonobankTransactionsMock({ response: mockedTransactions }));

  // Trigger transaction sync
  await helpers.bankDataProviders.syncTransactionsForAccount({
    connectionId,
    accountId: account.id,
    raw: true,
  });

  // Let server some time to process transactions via queues
  await helpers.sleep(1000);

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
