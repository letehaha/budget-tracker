import { ACCOUNT_STATUSES } from '@bt/shared/types';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import Accounts from '@models/accounts.model';
import { Op, type WhereOptions } from 'sequelize';

export const getAccountGroups = async ({
  userId,
  accountIds = [],
  includeArchived = false,
}: {
  userId: number;
  accountIds?: number[];
  includeArchived?: boolean;
}): Promise<AccountGroup[]> => {
  const accountWhere: WhereOptions<Accounts> = {};

  if (accountIds.length > 0) {
    accountWhere.id = { [Op.in]: accountIds };
  }

  if (!includeArchived) {
    accountWhere.status = ACCOUNT_STATUSES.active;
  }

  return AccountGroup.findAll({
    where: { userId },
    include: [
      { model: AccountGroup, as: 'childGroups' },
      {
        model: Accounts,
        where: accountWhere,
        through: { attributes: [] },
        required: accountIds.length > 0,
      },
    ],
  });
};
