import AccountGroup from '@models/accounts-groups/AccountGroups.model';

import { withTransaction } from '../common/with-transaction';

export const moveAccountGroup = withTransaction(
  async ({
    groupId,
    newParentGroupId,
    userId,
  }: {
    groupId: number;
    newParentGroupId: number | null;
    userId: number;
  }): Promise<[number, AccountGroup[]]> => {
    return AccountGroup.update(
      { parentGroupId: newParentGroupId },
      { where: { id: groupId, userId }, returning: true },
    );
  },
);
