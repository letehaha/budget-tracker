import Accounts from '@models/accounts.model';
import { findTransactions } from '@models/transactions-query';
import { format } from 'date-fns';

interface GetEarliestTransactionDateParams {
  userId: number;
}

/**
 * Returns the date of the user's earliest (oldest) transaction.
 * Only considers transactions from enabled accounts.
 * Returns null if the user has no transactions.
 *
 * Plans are intentions rather than history, so a future-dated one can never become the
 * date the user's records start.
 */
export const getEarliestTransactionDate = async ({
  userId,
}: GetEarliestTransactionDateParams): Promise<string | null> => {
  const [oldest] = await findTransactions({
    planned: 'exclude',
    access: { accessibleTo: userId },
    balanceAdjustments: 'include',
    completeness: 'probe',
    include: [
      {
        model: Accounts,
        where: { excludeFromStats: false },
        attributes: [],
      },
    ],
    order: [['time', 'ASC']],
    attributes: ['time'],
  });

  if (!oldest) return null;

  return format(new Date(oldest.time), 'yyyy-MM-dd');
};
