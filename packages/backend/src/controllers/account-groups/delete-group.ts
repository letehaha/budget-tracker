import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as accountGroupService from '@services/account-groups';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({ groupId: recordId() }),
  }),
  async ({ user, params }) => {
    await accountGroupService.deleteAccountGroup({
      groupId: params.groupId,
      userId: user.id,
    });
  },
);
