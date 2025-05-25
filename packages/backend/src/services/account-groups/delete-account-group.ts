import { logger } from '@js/utils';
import AccountGrouping from '@models/accounts-groups/AccountGrouping.model';
import AccountGroup from '@models/accounts-groups/AccountGroups.model';
import { removeAccountFromGroup } from '@services/account-groups/remove-account-from-group';

import { withTransaction } from '../common/with-transaction';

export const deleteAccountGroup = withTransaction(
  async ({ groupId, userId }: { groupId: number; userId: number }): Promise<void> => {
    try {
      const groupAccountMappings = await AccountGrouping.findAll({
        where: { groupId },
        include: [{ model: AccountGroup, as: 'group' }],
      });

      if (groupAccountMappings.length > 0) {
        const accountIds = groupAccountMappings.map((mapping) => mapping.accountId);
        await removeAccountFromGroup({ accountIds, groupId });
      }

      await AccountGroup.destroy({
        where: { id: groupId, userId },
      });
    } catch (err) {
      logger.error(err as Error);
    }
  },
);
