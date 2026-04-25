import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import Accounts from '@models/accounts.model';

import { withTransaction } from '../common/with-transaction';

export const addAccountToGroup = withTransaction(
  async ({
    accountId,
    groupId,
    userId,
  }: {
    accountId: number;
    groupId: number;
    userId: number;
  }): Promise<AccountGrouping> => {
    await findOrThrowNotFound({
      query: Accounts.findOne({ where: { id: accountId, userId } }),
      message: t({ key: 'accountGroups.accountNotFound' }),
    });

    await findOrThrowNotFound({
      query: AccountGroup.findOne({ where: { id: groupId, userId } }),
      message: t({ key: 'accountGroups.accountGroupNotFound' }),
    });

    await AccountGrouping.destroy({ where: { accountId } });

    return AccountGrouping.create({ accountId, groupId });
  },
);
