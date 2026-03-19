import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import AccountGroup from '@models/accounts-groups/account-groups.model';

import { withTransaction } from '../common/with-transaction';

export const updateAccountGroup = withTransaction(
  async ({
    groupId,
    userId,
    ...updates
  }: {
    groupId: number;
    userId: number;
  } & Partial<Pick<AccountGroup, 'name' | 'parentGroupId'>>): Promise<AccountGroup[]> => {
    await findOrThrowNotFound({
      query: AccountGroup.findByPk(groupId),
      message: t({ key: 'accountGroups.groupNotFound' }),
    });

    if (updates.parentGroupId) {
      await findOrThrowNotFound({
        query: AccountGroup.findByPk(updates.parentGroupId),
        message: t({ key: 'accountGroups.parentGroupNotExist' }),
      });
    }

    const [, updatedGroup] = await AccountGroup.update(updates, {
      where: { id: groupId, userId },
      returning: true,
    });

    return updatedGroup;
  },
);
