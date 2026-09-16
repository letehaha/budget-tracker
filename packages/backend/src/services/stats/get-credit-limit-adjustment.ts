import { ACCOUNT_CATEGORIES, type Cents, type RecordId } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import { getAccessibleAccountIdsForUser } from '@services/sharing/auth/get-accessible-account-ids.service';
import { Op } from 'sequelize';

import { AccountScope } from './get-balance-history';

/**
 * Base-currency credit limit (cents) per account, for the accounts named by
 * `accountScope` that have a credit limit and are not excluded from stats.
 * `accountScope` must match the scope of the balance read being adjusted: a limit
 * subtracted from a balance that never included that account is a wrong number.
 * Loans and vehicles are left out: no stats read nets them against a limit.
 */
export const getCreditLimitCentsByAccount = async ({
  userId,
  accountScope,
}: {
  userId: number;
  accountScope: AccountScope;
}): Promise<Map<RecordId, Cents>> => {
  const scopeWhere =
    accountScope === 'accessible' ? { id: { [Op.in]: await getAccessibleAccountIdsForUser({ userId }) } } : { userId };

  const accounts = await Accounts.findAll({
    where: {
      ...scopeWhere,
      excludeFromStats: false,
      creditLimit: { [Op.gt]: 0 },
      accountCategory: { [Op.notIn]: [ACCOUNT_CATEGORIES.loan, ACCOUNT_CATEGORIES.vehicle] },
    },
    attributes: ['id', 'refCreditLimit'],
  });

  return new Map(accounts.map((account) => [account.id, account.refCreditLimit.toCents()]));
};

/** Sum of `getCreditLimitCentsByAccount`, for reads that adjust one aggregate balance. */
export const getCreditLimitAdjustment = async ({
  userId,
  accountScope,
}: {
  userId: number;
  accountScope: AccountScope;
}): Promise<number> => {
  const limits = await getCreditLimitCentsByAccount({ userId, accountScope });
  return [...limits.values()].reduce((sum, cents) => sum + cents, 0);
};
