import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import AccountGroup from '@models/accounts-groups/AccountGroups.model';

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
    const existingGroup = await AccountGroup.findByPk(groupId);

    if (!existingGroup) {
      throw new NotFoundError({ message: t({ key: 'accountGroups.groupNotFound' }) });
    }

    if (updates.parentGroupId) {
      const existingParent = await AccountGroup.findByPk(updates.parentGroupId);

      if (!existingParent) {
        throw new NotFoundError({
          message: t({ key: 'accountGroups.parentGroupNotExist' }),
        });
      }
    }

    const [, updatedGroup] = await AccountGroup.update(updates, {
      where: { id: groupId, userId },
      returning: true,
    });

    return updatedGroup;
  },
);
