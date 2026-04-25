import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import Accounts from '@models/accounts.model';

import { withTransaction } from '../common/with-transaction';

export const removeAccountFromGroup = withTransaction(
  async ({ accountIds, groupId, userId }: { accountIds: number[]; groupId: number; userId: number }): Promise<void> => {
    await findOrThrowNotFound({
      query: AccountGroup.findOne({ where: { id: groupId, userId } }),
      message: t({ key: 'accountGroups.accountGroupNotFound' }),
    });

    const existingAccounts = await Accounts.findAll({
      where: { id: accountIds, userId },
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
