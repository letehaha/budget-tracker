import { HttpResponse, http } from 'msw';

import {
  INVALID_LUNCHFLOW_API_KEY,
  VALID_LUNCHFLOW_API_KEY,
  getMockedLunchflowAccounts,
  getMockedLunchflowBalance,
  getMockedLunchflowTransactions,
} from './data';

const LUNCHFLOW_BASE_URL = 'https://lunchflow.app/api/v1';

export const LUNCHFLOW_URLS_MOCK = Object.freeze({
  accounts: `${LUNCHFLOW_BASE_URL}/accounts`,
  balance: new RegExp(`${LUNCHFLOW_BASE_URL}/accounts/\\d+/balance`),
  transactions: new RegExp(`${LUNCHFLOW_BASE_URL}/accounts/\\d+/transactions`),
});

// Storage for mocked data per test
let mockedAccounts = getMockedLunchflowAccounts();
const mockedBalances = new Map<number, ReturnType<typeof getMockedLunchflowBalance>>();
const mockedTransactions = new Map<number, ReturnType<typeof getMockedLunchflowTransactions>>();

export const resetLunchflowMocks = () => {
  mockedAccounts = getMockedLunchflowAccounts();
  mockedBalances.clear();
  mockedTransactions.clear();
};

export const setMockedLunchflowAccounts = (accounts: ReturnType<typeof getMockedLunchflowAccounts>) => {
  mockedAccounts = accounts;
  // Initialize balances and transactions for new accounts
  accounts.forEach((account) => {
    if (!mockedBalances.has(account.id)) {
      mockedBalances.set(account.id, getMockedLunchflowBalance());
    }
    if (!mockedTransactions.has(account.id)) {
      const balance = mockedBalances.get(account.id)!;
      mockedTransactions.set(
        account.id,
        getMockedLunchflowTransactions(account.id, 10, { startingBalance: balance.amount }),
      );
    }
  });
};

export const setMockedLunchflowBalance = (accountId: number, balance: ReturnType<typeof getMockedLunchflowBalance>) => {
  mockedBalances.set(accountId, balance);
};

export const setMockedLunchflowTransactions = (
  accountId: number,
  transactions: ReturnType<typeof getMockedLunchflowTransactions>,
) => {
  mockedTransactions.set(accountId, transactions);
};

export const lunchflowHandlers = [
  // Get accounts
  http.get(LUNCHFLOW_URLS_MOCK.accounts, ({ request }) => {
    const apiKey = request.headers.get('x-api-key');

    if (apiKey === INVALID_LUNCHFLOW_API_KEY) {
      return new HttpResponse(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    if (apiKey !== VALID_LUNCHFLOW_API_KEY) {
      return new HttpResponse(null, {
        status: 403,
        statusText: 'Forbidden',
      });
    }

    return HttpResponse.json({
      accounts: mockedAccounts,
      total: mockedAccounts.length,
    });
  }),

  // Get balance for specific account
  http.get(LUNCHFLOW_URLS_MOCK.balance, ({ request }) => {
    const apiKey = request.headers.get('x-api-key');

    if (apiKey !== VALID_LUNCHFLOW_API_KEY) {
      return new HttpResponse(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    // Extract account ID from URL
    const accountId = parseInt(request.url.split('/accounts/')[1]!.split('/')[0]!);
    const balance = mockedBalances.get(accountId) || getMockedLunchflowBalance();

    return HttpResponse.json({
      balance,
    });
  }),

  // Get transactions for specific account
  http.get(LUNCHFLOW_URLS_MOCK.transactions, ({ request }) => {
    const apiKey = request.headers.get('x-api-key');

    if (apiKey !== VALID_LUNCHFLOW_API_KEY) {
      return new HttpResponse(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    // Extract account ID from URL
    const accountId = parseInt(request.url.split('/accounts/')[1]!.split('/')[0]!);
    const transactions = mockedTransactions.get(accountId) || getMockedLunchflowTransactions(accountId);

    return HttpResponse.json({
      transactions,
      total: transactions.length,
    });
  }),
];
