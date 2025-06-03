import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as accountGroupService from '@services/account-groups';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      accountId: recordId(),
      groupId: recordId(),
    }),
  }),
  async ({ params }) => {
    const data = await accountGroupService.addAccountToGroup({
      accountId: params.accountId,
      groupId: params.groupId,
    });

    return { data };
  },
);
