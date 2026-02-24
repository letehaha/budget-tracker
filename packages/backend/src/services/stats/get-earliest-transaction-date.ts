import Accounts from '@models/Accounts.model';
import * as Transactions from '@models/Transactions.model';
import { format } from 'date-fns';

interface GetEarliestTransactionDateParams {
  userId: number;
}

/**
 * Returns the date of the user's earliest (oldest) transaction.
 * Only considers transactions from enabled accounts.
 * Returns null if the user has no transactions.
 */
export const getEarliestTransactionDate = async ({
  userId,
}: GetEarliestTransactionDateParams): Promise<string | null> => {
  const oldest: Pick<Transactions.default, 'time'> | null = await Transactions.default.findOne({
    where: { userId },
    include: [
      {
        model: Accounts,
        where: { isEnabled: true },
        attributes: [],
      },
    ],
    order: [['time', 'ASC']],
    attributes: ['time'],
  });

  if (!oldest) return null;

  return format(new Date(oldest.time), 'yyyy-MM-dd');
};
