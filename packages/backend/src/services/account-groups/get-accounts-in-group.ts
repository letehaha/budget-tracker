import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroup from '@models/accounts-groups/account-groups.model';

import { withTransaction } from '../common/with-transaction';

export const getAccountsInGroup = withTransaction(
  async ({ groupId, userId }: { groupId: string; userId: number }): Promise<AccountGrouping[]> => {
    return AccountGrouping.findAll({
      where: { groupId },
      include: [{ model: AccountGroup, as: 'group', required: true, where: { userId } }],
    });
  },
);
