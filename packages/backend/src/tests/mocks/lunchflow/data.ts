import { asDecimal } from '@bt/shared/types';
import { faker } from '@faker-js/faker';
import type {
  LunchFlowApiAccountsResponse,
  LunchFlowApiBalance,
  LunchFlowApiTransaction,
  LunchFlowApiTransactionsResponse,
} from '@services/bank-data-providers/lunchflow/types';
import { subDays } from 'date-fns';

export const getMockedLunchFlowAccounts = (): LunchFlowApiAccountsResponse => ({
  accounts: [
    {
      id: 1001,
      name: 'Test Checking Account',
      institution_name: 'Test Bank USA',
      institution_logo: 'https://example.com/logo1.png',
      provider: 'test_bank_usa',
      status: 'ACTIVE',
    },
    {
      id: 1002,
      name: 'Test Savings Account',
      institution_name: 'Test Bank EU',
      institution_logo: 'https://example.com/logo2.png',
      provider: 'test_bank_eu',
      status: 'ACTIVE',
    },
  ],
  total: 2,
});

export const getMockedLunchFlowBalance = ({
  accountId,
}: {
  accountId?: string | number;
} = {}): LunchFlowApiBalance => {
  const id = accountId ? Number(accountId) : 1001;
  return {
    balance: {
      amount: asDecimal(id === 1001 ? 1523.45 : 850.0),
      currency: id === 1001 ? 'USD' : 'EUR',
    },
  };
};

export const getMockedLunchFlowTransactions = (amount = 5): LunchFlowApiTransactionsResponse => {
  const currentDate = new Date();

  const transactions: LunchFlowApiTransaction[] = Array.from({ length: amount }, (_, index) => {
    const txAmount = faker.number.float({ min: 5, max: 500, fractionDigits: 2 });
    // Alternate between expenses and incomes
    const signedAmount = index % 3 === 0 ? txAmount : -txAmount;

    return {
      id: faker.string.uuid(),
      accountId: 1001,
      amount: asDecimal(signedAmount),
      currency: 'USD',
      date: subDays(currentDate, index).toISOString(),
      merchant: faker.company.name(),
      description: `Payment at ${faker.company.name()}`,
      isPending: false,
    };
  });

  return {
    transactions,
    total: transactions.length,
  };
};

/**
 * Create transactions with some pending (null ID) to test filtering
 */
export const getMockedLunchFlowTransactionsWithPending = (amount = 5): LunchFlowApiTransactionsResponse => {
  const result = getMockedLunchFlowTransactions(amount);

  // Make last transaction pending (null ID)
  const lastTransaction = result.transactions.at(-1);
  if (lastTransaction) {
    lastTransaction.id = null;
    lastTransaction.isPending = true;
  }

  return result;
};
