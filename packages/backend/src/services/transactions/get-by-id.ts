import * as Transactions from '@models/Transactions.model';

import { withTransaction } from '../common/with-transaction';

export const getTransactionById = withTransaction(
  async ({ id, userId, includeSplits }: { id: number; userId: number; includeSplits?: boolean }) => {
    const data = await Transactions.getTransactionById({
      id,
      userId,
      includeSplits,
    });

    return data;
  },
);
