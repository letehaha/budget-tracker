import Accounts from '@models/Accounts.model';
import AccountGroup from '@models/accounts-groups/AccountGroups.model';
import { Op, type WhereOptions } from 'sequelize';

export const getAccountGroups = async ({
  userId,
  accountIds = [],
  hidden = false,
}: {
  userId: number;
  accountIds?: number[];
  hidden?: boolean;
}): Promise<AccountGroup[]> => {
  const accountWhere: WhereOptions<Accounts> = {};

  if (accountIds.length > 0) {
    accountWhere.id = { [Op.in]: accountIds };
  }

  if (!hidden) {
    accountWhere.isEnabled = true;
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
