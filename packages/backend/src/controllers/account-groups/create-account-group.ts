import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as accountGroupService from '@services/account-groups';
import { z } from 'zod';

export default createController(
  z.object({
    body: z
      .object({
        name: z.string().min(1),
        parentGroupId: recordId().nullable().optional(),
      })
      .strict(),
  }),
  async ({ user, body }) => {
    const { name, parentGroupId } = body;

    const data = await accountGroupService.createAccountGroup({
      userId: user.id,
      name,
      parentGroupId,
    });

    return { data };
  },
);
