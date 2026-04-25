import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import AccountGroup from '@models/accounts-groups/account-groups.model';

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
    if (newParentGroupId !== null) {
      await findOrThrowNotFound({
        query: AccountGroup.findOne({ where: { id: newParentGroupId, userId } }),
        message: t({ key: 'accountGroups.parentGroupNotExist' }),
      });
    }

    return AccountGroup.update(
      { parentGroupId: newParentGroupId },
      { where: { id: groupId, userId }, returning: true },
    );
  },
);
