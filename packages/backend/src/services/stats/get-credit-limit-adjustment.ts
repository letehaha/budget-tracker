import Accounts from '@models/accounts.model';
import { getAccessibleAccountIdsForUser } from '@services/sharing/auth/get-accessible-account-ids.service';
import { Op } from 'sequelize';

import { AccountScope } from './get-balance-history';

/**
 * Calculates the total credit limit in base currency (cents) for the accounts named by
 * `accountScope` that have a credit limit and are not excluded from stats.
 *
 * Used to adjust balance calculations when the user enables the
 * "include credit limit in stats" setting. `accountScope` must match the scope of the
 * balance read being adjusted — a limit subtracted from a balance that never included
 * that account is a wrong number, not an error.
 */
export const getCreditLimitAdjustment = async ({
  userId,
  accountScope,
}: {
  userId: number;
  accountScope: AccountScope;
}): Promise<number> => {
  const scopeWhere =
    accountScope === 'accessible' ? { id: { [Op.in]: await getAccessibleAccountIdsForUser({ userId }) } } : { userId };

  const accounts = await Accounts.findAll({
    where: {
      ...scopeWhere,
      excludeFromStats: false,
      creditLimit: { [Op.gt]: 0 },
    },
    attributes: ['refCreditLimit'],
  });

  return accounts.reduce((sum, account) => sum + account.refCreditLimit.toCents(), 0);
};
