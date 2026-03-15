import { commaSeparatedRecordIds } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { serializeAccountGroups } from '@root/serializers';
import * as accountGroupService from '@services/account-groups';
import { z } from 'zod';

export default createController(
  z.object({
    query: z.object({
      accountIds: commaSeparatedRecordIds.optional(),
      includeArchived: z.coerce.boolean().optional().default(false),
    }),
  }),
  async ({ user, query }) => {
    const data = await accountGroupService.getAccountGroups({
      userId: user.id,
      accountIds: query.accountIds,
      includeArchived: query.includeArchived,
    });

    return { data: serializeAccountGroups(data) };
  },
);
