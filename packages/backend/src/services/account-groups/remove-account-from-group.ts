import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { NotFoundError } from '@js/errors';
import AccountGrouping from '@models/accounts-groups/AccountGrouping.model';
import AccountGroup from '@models/accounts-groups/AccountGroups.model';
import Accounts from '@models/Accounts.model';

import { withTransaction } from '../common/with-transaction';

export const removeAccountFromGroup = withTransaction(
  async ({ accountIds, groupId }: { accountIds: number[]; groupId: number }): Promise<void> => {
    await findOrThrowNotFound({
      query: AccountGroup.findByPk(groupId),
      message: 'Group with provided id does not exist',
    });
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
