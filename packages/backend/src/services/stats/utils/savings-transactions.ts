import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

import { getWhereConditionForTime } from './index';

/**
 * Real income and expense transactions that make up the "savings intake", matching
 * get-cash-flow's semantics: filtering `not_transfer` drops every transfer nature
 * (including the balance adjustments that carry an income/expense type but move no
 * real money), and accounts flagged `excludeFromStats` are left out.
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
}): Promise<Transactions[]> =>
  Transactions.findAll({
    where: {
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      transactionType: { [Op.in]: [TRANSACTION_TYPES.income, TRANSACTION_TYPES.expense] },
      ...getWhereConditionForTime({ from, to, columnName: 'time' }),
    },
    include: [{ model: Accounts, where: { excludeFromStats: false }, attributes: [] }],
    attributes: ['time', 'refAmount', 'transactionType'],
  });
