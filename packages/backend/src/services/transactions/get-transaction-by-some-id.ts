import * as Transactions from '@models/Transactions.model';

import { withTransaction } from '../common/with-transaction';

export const getTransactionBySomeId = withTransaction(async (payload: Transactions.GetTransactionBySomeIdPayload) =>
  Transactions.getTransactionBySomeId(payload),
);
