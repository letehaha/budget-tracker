import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { commaSeparatedRecordIds } from '@common/lib/zod/custom-types';
import type { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import * as accountGroupService from '@services/account-groups';
import { z } from 'zod';

export const getAccountGroups = async (req, res: CustomResponse) => {
  try {
    const { id: userId } = req.user;
    const { accountIds, hidden }: GetAccountGroupsParams['query'] = req.validated.query;

    const groups = await accountGroupService.getAccountGroups({
      userId,
      accountIds,
      hidden,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: groups,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const getAccountGroupsSchema = z.object({
  query: z.object({
    accountIds: commaSeparatedRecordIds.optional(),
    hidden: z.coerce.boolean(),
  }),
});

type GetAccountGroupsParams = z.infer<typeof getAccountGroupsSchema>;
