import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { countTransactions, findTransactions } from '@models/transactions-query';
import { Op, col, fn } from 'sequelize';

// Mirrors the predicate `delete-loan.service` uses to block deletion, so the
// frontend can warn before the user confirms instead of after rejection.
export const countLoanPayments = ({ userId, accountId }: { userId: number; accountId: string }): Promise<number> =>
  countTransactions({
    planned: 'exclude',
    access: { creator: userId },
    transfers: { natures: [TRANSACTION_TRANSFER_NATURE.transfer_to_loan] },
    // An adjustment-flagged leg still moved the loan balance, so it is a payment.
    balanceAdjustments: 'include',
    where: { accountId },
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

  const grouped = (await findTransactions({
    planned: 'exclude',
    access: { creator: userId },
    transfers: { natures: [TRANSACTION_TRANSFER_NATURE.transfer_to_loan] },
    balanceAdjustments: 'include',
    completeness: 'all',
    where: { accountId: { [Op.in]: accountIds } },
    attributes: ['accountId', [fn('COUNT', col('id')), 'count']],
    group: ['accountId'],
    raw: true,
  })) as unknown as { accountId: string; count: string | number }[];

  return new Map(grouped.map((row) => [row.accountId, Number(row.count)]));
};
