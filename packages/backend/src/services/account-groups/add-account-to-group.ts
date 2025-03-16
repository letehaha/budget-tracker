import { NotAllowedError, NotFoundError } from '@js/errors';
import { logger } from '@js/utils';
import Accounts from '@models/Accounts.model';
import AccountGrouping from '@models/accounts-groups/AccountGrouping.model';
import AccountGroup from '@models/accounts-groups/AccountGroups.model';

import { withTransaction } from '../common/with-transaction';

export const addAccountToGroup = withTransaction(
  async ({ accountId, groupId }: { accountId: number; groupId: number }): Promise<AccountGrouping> => {
    const existingAccount = await Accounts.findByPk(accountId);
    if (!existingAccount) {
      throw new NotFoundError({
        message: 'Account with such id is not found.',
      });
    }

    const existingGroup = await AccountGroup.findByPk(groupId);
    if (!existingGroup) {
      throw new NotFoundError({
        message: 'Account group with such id is not found.',
      });
    }

    if (existingAccount.userId !== existingGroup.userId) {
      logger.error('Tried to add account to a group with different userId in both.', {
        accountId,
        groupId,
      });
      throw new NotAllowedError({ message: 'Operation is not allowed' });
    }

    // Remove all other account linkings
    await AccountGrouping.destroy({ where: { accountId } });

    return AccountGrouping.create({ accountId, groupId });
  },
);
