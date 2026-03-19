import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotAllowedError } from '@js/errors';
import { logger } from '@js/utils';
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import Accounts from '@models/accounts.model';

import { withTransaction } from '../common/with-transaction';

export const addAccountToGroup = withTransaction(
  async ({ accountId, groupId }: { accountId: number; groupId: number }): Promise<AccountGrouping> => {
    const existingAccount = await findOrThrowNotFound({
      query: Accounts.findByPk(accountId),
      message: t({ key: 'accountGroups.accountNotFound' }),
    });

    const existingGroup = await findOrThrowNotFound({
      query: AccountGroup.findByPk(groupId),
      message: t({ key: 'accountGroups.accountGroupNotFound' }),
    });

    if (existingAccount.userId !== existingGroup.userId) {
      logger.error('Tried to add account to a group with different userId in both.', {
        accountId,
        groupId,
      });
      throw new NotAllowedError({ message: t({ key: 'accountGroups.operationNotAllowed' }) });
    }

    // Remove all other account linkings
    await AccountGrouping.destroy({ where: { accountId } });

    return AccountGrouping.create({ accountId, groupId });
  },
);
