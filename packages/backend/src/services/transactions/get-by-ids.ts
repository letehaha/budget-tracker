import { ValidationError } from '@js/errors';
import * as Transactions from '@models/Transactions.model';
import { serializeTransactions } from '@root/serializers/transactions.serializer';

import { withTransaction } from '../common/with-transaction';

const MAX_IDS = 50;

interface GetTransactionsByIdsParams {
  userId: number;
  ids: number[];
}

export const getTransactionsByIds = withTransaction(async ({ userId, ids }: GetTransactionsByIdsParams) => {
  if (ids.length > MAX_IDS) {
    throw new ValidationError({
      message: `Cannot fetch more than ${MAX_IDS} transactions at once`,
    });
  }

  if (ids.length === 0) {
    return [];
  }

  const transactions = await Transactions.getTransactionsByArrayOfField({
    fieldName: 'id',
    fieldValues: ids,
    userId,
  });

  return serializeTransactions(transactions);
});
