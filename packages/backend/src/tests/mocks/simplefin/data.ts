import { faker } from '@faker-js/faker';
import type {
  SimplefinAccountSet,
  SimplefinError,
  SimplefinTransaction,
} from '@services/bank-data-providers/simplefin/types';
import { subDays } from 'date-fns';

export const SIMPLEFIN_ACCOUNT_1 = 'ACT-CHECKING-001';
export const SIMPLEFIN_ACCOUNT_2 = 'ACT-SAVINGS-002';

/** conn_id used by the protocol-v2 fixtures. */
export const SIMPLEFIN_CONN_ID = 'CONN-TEST-BANK';

const toEpochSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

/**
 * SimpleFIN transactions: decimal-string amounts (positive = deposit), posted
 * as UNIX epoch seconds, dated within the last `amount` days so they fall
 * inside a 1-year backfill window.
 */
export const getMockedSimplefinTransactions = (amount = 5): SimplefinTransaction[] => {
  const now = new Date();

  return Array.from({ length: amount }, (_, index) => {
    const value = faker.number.float({ min: 5, max: 500, fractionDigits: 2 });
    // Alternate income/expense.
    const signed = index % 3 === 0 ? value : -value;

    return {
      id: faker.string.uuid(),
      posted: toEpochSeconds(subDays(now, index)),
      amount: signed.toFixed(2),
      description: `Payment at ${faker.company.name()}`,
      payee: faker.company.name(),
      memo: 'Test memo',
      pending: false,
    };
  });
};

/** Same as above, but the last transaction is pending (posted = 0). */
export const getMockedSimplefinTransactionsWithPending = (amount = 5): SimplefinTransaction[] => {
  const transactions = getMockedSimplefinTransactions(amount);
  const last = transactions.at(-1);
  if (last) {
    last.pending = true;
    last.posted = 0;
  }
  return transactions;
};

/**
 * One transaction per entry in `daysAgo`, posted that many days before now.
 * Handy for spreading transactions across multiple 89-day fetch windows.
 */
export const getMockedSimplefinTransactionsOnDaysAgo = (daysAgo: number[]): SimplefinTransaction[] => {
  const now = new Date();
  return daysAgo.map((days, index) => ({
    id: faker.string.uuid(),
    // Alternate income/expense so sign-mapping is exercised.
    amount: (index % 2 === 0 ? 100 + index : -(100 + index)).toFixed(2),
    posted: toEpochSeconds(subDays(now, days)),
    description: `Window tx ${days}d ago`,
    payee: faker.company.name(),
    memo: 'Test memo',
    pending: false,
  }));
};

/**
 * A two-account AccountSet (both USD), protocol-v1 shape (org embedded on each
 * account). Pass transactions to embed them on the first (checking) account —
 * mirrors how SimpleFIN nests transactions inside each account in the
 * `/accounts` response. `errlist`/`errors` populate the structured/legacy error
 * channels.
 */
export const getMockedSimplefinAccountSet = ({
  account1Transactions = [],
  account2Transactions = [],
  errlist,
  errors,
}: {
  account1Transactions?: SimplefinTransaction[];
  account2Transactions?: SimplefinTransaction[];
  errlist?: SimplefinError[];
  errors?: string[];
} = {}): SimplefinAccountSet => {
  const balanceDate = toEpochSeconds(new Date());
  const org = {
    name: 'Test Bank',
    domain: 'testbank.example',
    'sfin-url': 'https://beta-bridge.simplefin.org/simplefin',
  };

  return {
    errors: errors ?? [],
    ...(errlist ? { errlist } : {}),
    accounts: [
      {
        org,
        id: SIMPLEFIN_ACCOUNT_1,
        name: 'Test Checking',
        currency: 'USD',
        balance: '1523.45',
        'available-balance': '1500.00',
        'balance-date': balanceDate,
        transactions: account1Transactions,
      },
      {
        org,
        id: SIMPLEFIN_ACCOUNT_2,
        name: 'Test Savings',
        currency: 'USD',
        balance: '850.00',
        'balance-date': balanceDate,
        transactions: account2Transactions,
      },
    ],
  };
};

/**
 * Protocol-v2 shape of the same two-account set: accounts carry no embedded
 * `org`, instead referencing a top-level `connections[]` entry via `conn_id`.
 * Used to verify org/institution resolution under v2.
 */
export const getMockedSimplefinAccountSetV2 = ({
  account1Transactions = [],
  account2Transactions = [],
}: {
  account1Transactions?: SimplefinTransaction[];
  account2Transactions?: SimplefinTransaction[];
} = {}): SimplefinAccountSet => {
  const balanceDate = toEpochSeconds(new Date());

  return {
    errlist: [],
    connections: [
      {
        conn_id: SIMPLEFIN_CONN_ID,
        name: 'Test Bank',
        org_id: 'test-bank',
        org_url: 'https://testbank.example',
        'sfin-url': 'https://beta-bridge.simplefin.org/simplefin',
      },
    ],
    accounts: [
      {
        conn_id: SIMPLEFIN_CONN_ID,
        id: SIMPLEFIN_ACCOUNT_1,
        name: 'Test Checking',
        currency: 'USD',
        balance: '1523.45',
        'available-balance': '1500.00',
        'balance-date': balanceDate,
        transactions: account1Transactions,
      },
      {
        conn_id: SIMPLEFIN_CONN_ID,
        id: SIMPLEFIN_ACCOUNT_2,
        name: 'Test Savings',
        currency: 'USD',
        balance: '850.00',
        'balance-date': balanceDate,
        transactions: account2Transactions,
      },
    ],
  };
};
