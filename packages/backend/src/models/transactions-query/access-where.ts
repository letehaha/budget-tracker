import Accounts from '@models/accounts.model';
import BudgetTransactions from '@models/budget-transactions.model';
import { getAccessibleAccountIdsForUser } from '@services/sharing/auth/get-accessible-account-ids.service';
import { Op, WhereOptions } from 'sequelize';

import { AccessPolicy } from './policies';

/**
 * Scopes that cannot be expressed as a plain Transactions where are pre-resolved to id
 * lists here, which keeps where-composition pure and avoids include-injection.
 */
export const accessWhere = async ({ policy }: { policy: AccessPolicy }): Promise<WhereOptions> => {
  if (policy === 'unscoped-internal') return {};

  if ('creator' in policy) return { userId: policy.creator };

  if ('accountOwner' in policy) {
    const rows = (await Accounts.findAll({
      where: { userId: policy.accountOwner },
      attributes: ['id'],
      raw: true,
    })) as unknown as { id: string }[];

    return { accountId: { [Op.in]: rows.map((row) => row.id) } };
  }

  if ('accessibleTo' in policy) {
    return { accountId: { [Op.in]: await getAccessibleAccountIdsForUser({ userId: policy.accessibleTo }) } };
  }

  const rows = (await BudgetTransactions.findAll({
    where: { budgetId: { [Op.in]: policy.budgetScoped } },
    attributes: ['transactionId'],
    raw: true,
  })) as unknown as { transactionId: string }[];

  return { id: { [Op.in]: rows.map((row) => row.transactionId) } };
};
