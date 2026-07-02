import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

// Mirrors the predicate `delete-loan.service` uses to block deletion, so the
// frontend can warn before the user confirms instead of after rejection.
export const countLoanPayments = ({ userId, accountId }: { userId: number; accountId: string }): Promise<number> =>
  Transactions.count({
    where: {
      accountId,
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
    },
  });

// One query for every loan instead of a per-loan round trip. Loans with zero
// payments are absent from the result; callers default a missing key to 0.
export const countLoanPaymentsByAccountIds = async ({
  userId,
  accountIds,
}: {
  userId: number;
  accountIds: string[];
}): Promise<Map<string, number>> => {
  if (accountIds.length === 0) return new Map();

  const grouped = (await Transactions.count({
    where: {
      userId,
      accountId: { [Op.in]: accountIds },
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
    },
    group: ['accountId'],
  })) as unknown as { accountId: string; count: number }[];

  return new Map(grouped.map((row) => [row.accountId, row.count]));
};
