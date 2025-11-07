import { ExternalMonobankTransactionResponse } from '@bt/shared/types';
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

const pairMonobankUser = (token: string = VALID_MONOBANK_TOKEN) => {
  return helpers.makeRequest({
    method: 'post',
    url: '/banks/monobank/pair-user',
    payload: {
      token,
    },
  });
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
  const accounts: Accounts[] = helpers.extractResponse(
    await helpers.makeRequest({
      method: 'get',
      url: '/accounts',
    }),
  );
  const account = accounts[1]!;

  const mockedTransactions = getMockedTransactionData(amount, {
    initialBalance: account.initialBalance,
  });

  global.mswMockServer.use(getMonobankTransactionsMock(mockedTransactions));

  await helpers.makeRequest({
    method: 'get',
    url: '/banks/monobank/load-transactions',
    payload: {
      from: subDays(new Date(), 2).getTime(),
      to: new Date().getTime(),
      accountId: account.id,
    },
  });

  // Let server some time to process transactions
  await helpers.sleep(500);

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
