import * as Transactions from '@models/Transactions.model';

import { withTransaction } from '../common/with-transaction';

export const getTransactionsByTransferId = withTransaction(
  async ({ transferId, userId }: { transferId: string; userId: number }) => {
    const data = await Transactions.getTransactionsByTransferId({
      transferId,
      userId,
    });

    return data;
  },
);
