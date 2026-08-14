import { TRANSACTION_TYPES } from '@bt/shared/types';
import { StatsTransactionsResult, statsTransactions } from '@services/stats/stats-transactions';
import { Op } from 'sequelize';

/**
 * Real income and expense transactions that make up the "savings intake", matching
 * get-cash-flow's semantics: transfer legs are out (including the balance adjustments
 * that carry an income/expense type but move no real money), accounts flagged
 * `excludeFromStats` are left out, and refund pairs come back resolved so both sides
 * of a refund can be netted.
 *
 * Shared by the net-worth-drivers and investment-contributions reports so both read
 * the exact same transaction set. `refAmount` keeps its Money getter (no `raw`), so
 * callers convert to cents themselves.
 */
export const fetchSavingsTransactions = ({
  userId,
  from,
  to,
}: {
  userId: number;
  from: string;
  to: string;
}): Promise<StatsTransactionsResult> =>
  statsTransactions({
    access: { creator: userId },
    planned: 'exclude',
    refunds: 'net',
    window: { from, to },
    where: { transactionType: { [Op.in]: [TRANSACTION_TYPES.income, TRANSACTION_TYPES.expense] } },
    attributes: ['id', 'time', 'refAmount', 'transactionType', 'categoryId', 'refundLinked'],
  });
