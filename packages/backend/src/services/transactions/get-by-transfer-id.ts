import * as Transactions from '@models/Transactions.model';

import { withTransaction } from '../common/with-transaction';

export const getTransactionsByTransferId = withTransaction(
  async ({
    transferId,
    userId,
    includeUser,
    includeAccount,
    includeCategory,
    includeAll,
    nestedInclude,
  }: {
    transferId: string;
    userId: number;
    includeUser?: boolean;
    includeAccount?: boolean;
    includeCategory?: boolean;
    includeAll?: boolean;
    nestedInclude?: boolean;
  }) => {
    const data = await Transactions.getTransactionsByTransferId({
      transferId,
      userId,
      includeUser,
      includeAccount,
      includeCategory,
      includeAll,
      nestedInclude,
    });

    return data;
  },
);
