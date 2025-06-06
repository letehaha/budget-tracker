import { commaSeparatedRecordIds } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as accountGroupService from '@services/account-groups';
import { z } from 'zod';

export default createController(
  z.object({
    query: z.object({
      accountIds: commaSeparatedRecordIds.optional(),
      hidden: z.coerce.boolean(),
    }),
  }),
  async ({ user, query }) => {
    const data = await accountGroupService.getAccountGroups({
      userId: user.id,
      accountIds: query.accountIds,
      hidden: query.hidden,
    });

    return { data };
  },
);
