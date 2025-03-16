import { withTransaction } from '../common/with-transaction';
import { getSpendingsByCategories } from './get-spendings-by-categories/index';

export const getExpensesAmountForPeriod = withTransaction(
  async (params: Parameters<typeof getSpendingsByCategories>[0]) => {
    const spendingsByCategories = await getSpendingsByCategories(params);

    return Object.values(spendingsByCategories).reduce((acc, curr) => acc + curr.amount, 0);
  },
);
