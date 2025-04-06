import * as Transactions from '@models/Transactions.model';

import { withTransaction } from '../common/with-transaction';

export const getTransactions = withTransaction(
  async (params: Omit<Parameters<typeof Transactions.findWithFilters>[0], 'isRaw'>) => {
    const data = await Transactions.findWithFilters({ ...params, isRaw: true });

    return data;
  },
);
