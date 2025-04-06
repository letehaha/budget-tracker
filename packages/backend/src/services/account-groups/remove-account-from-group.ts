import { NotFoundError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import AccountGrouping from '@models/accounts-groups/AccountGrouping.model';
import AccountGroup from '@models/accounts-groups/AccountGroups.model';

import { withTransaction } from '../common/with-transaction';

export const removeAccountFromGroup = withTransaction(
  async ({ accountIds, groupId }: { accountIds: number[]; groupId: number }): Promise<void> => {
    const group = await AccountGroup.findByPk(groupId);
    if (!group) {
      throw new NotFoundError({
        message: 'Group with provided id does not exist',
      });
    }
    const existingAccounts = await Accounts.findAll({
      where: { id: accountIds },
    });

    const missingAccountIds = accountIds.filter((id) => !existingAccounts.some((acc) => acc.id === id));
    if (missingAccountIds.length > 0) {
      throw new NotFoundError({
        message: `Accounts with ids ${missingAccountIds.join(', ')} do not exist`,
      });
    }

    await AccountGrouping.destroy({
      where: {
        accountId: accountIds,
        groupId,
      },
    });
  },
);
