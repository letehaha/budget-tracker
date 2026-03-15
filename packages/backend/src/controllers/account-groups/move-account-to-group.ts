import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import * as accountGroupService from '@services/account-groups';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ groupId: recordId() }),
    body: z.object({ newParentGroupId: recordId().nullable() }),
  }),
  async ({ user, params, body }) => {
    const [updatedCount, updatedGroups] = await accountGroupService.moveAccountGroup({
      groupId: params.groupId,
      newParentGroupId: body.newParentGroupId,
      userId: user.id,
    });

    if (updatedCount === 0) {
      throw new NotFoundError({ message: t({ key: 'accounts.groupNotFound' }) });
    }

    return { data: updatedGroups[0] };
  },
);
