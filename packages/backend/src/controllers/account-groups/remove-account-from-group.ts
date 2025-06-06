import { recordArrayIds, recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as accountGroupService from '@services/account-groups';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      groupId: recordId(),
    }),
    body: z.object({
      accountIds: recordArrayIds(),
    }),
  }),
  async ({ params, body }) => {
    await accountGroupService.removeAccountFromGroup({
      accountIds: body.accountIds,
      groupId: params.groupId,
    });
  },
);
