import { NotAllowedError } from '@js/errors';
import { logger } from '@js/utils';
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import { removeAccountFromGroup } from '@services/account-groups/remove-account-from-group';

import { withTransaction } from '../common/with-transaction';

export const deleteAccountGroup = withTransaction(
  async ({ groupId, userId }: { groupId: number; userId: number }): Promise<void> => {
    try {
      const group = await AccountGroup.findOne({ where: { id: groupId, userId } });

      if (!group) return;

      if (group.bankDataProviderConnectionId !== null) {
        throw new NotAllowedError({
          message: 'Cannot delete an account group linked to a bank connection. Disconnect the bank connection first.',
        });
      }

      const groupAccountMappings = await AccountGrouping.findAll({
        where: { groupId },
        include: [{ model: AccountGroup, as: 'group' }],
      });

      if (groupAccountMappings.length > 0) {
        const accountIds = groupAccountMappings.map((mapping) => mapping.accountId);
        await removeAccountFromGroup({ accountIds, groupId, userId });
      }

      await group.destroy();
    } catch (err) {
      if (err instanceof NotAllowedError) throw err;
      logger.error(err as Error);
    }
  },
);
