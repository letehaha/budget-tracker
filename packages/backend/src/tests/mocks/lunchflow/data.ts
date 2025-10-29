import { faker } from '@faker-js/faker';
import type { LunchFlowAccount, LunchFlowBalance, LunchFlowTransaction } from '@services/banks/lunchflow/api-client';

export const VALID_LUNCHFLOW_API_KEY = 'lf_test_key_valid_123456';
export const INVALID_LUNCHFLOW_API_KEY = 'lf_test_key_invalid';

export const getMockedLunchflowAccounts = (amount = 2): LunchFlowAccount[] => {
  return new Array(amount).fill(0).map((_, index) => ({
    id: index + 1,
    name: faker.finance.accountName(),
    institution_name: faker.company.name(),
    institution_logo: faker.image.url(),
    provider: 'gocardless' as const,
    status: 'ACTIVE' as const,
  }));
};

export const getMockedLunchflowBalance = (amount?: number): LunchFlowBalance => ({
  amount: amount ?? faker.number.float({ min: 1000, max: 50000, fractionDigits: 2 }),
  currency: 'PLN',
});

export const getMockedLunchflowTransactions = (
  accountId: number,
  amount = 10,
  { startingBalance }: { startingBalance?: number } = {},
): LunchFlowTransaction[] => {
  let currentBalance = startingBalance ?? faker.number.float({ min: 1000, max: 50000, fractionDigits: 2 });

  return new Array(amount).fill(0).map((_, index) => {
    // Mix of income and expenses
    const isIncome = index % 3 === 0;
    const txAmount = faker.number.float({ min: 10, max: 500, fractionDigits: 2 });
    const signedAmount = isIncome ? txAmount : -txAmount;

    currentBalance = currentBalance + signedAmount;

    const date = new Date();
    date.setDate(date.getDate() - (amount - index)); // Spread transactions over past days

    return {
      id: faker.string.uuid(),
      accountId,
      amount: signedAmount,
      currency: 'PLN',
      date: date.toISOString().split('T')[0]!, // YYYY-MM-DD format
      merchant: faker.company.name(),
      description: faker.lorem.sentence(),
    };
  });
};
