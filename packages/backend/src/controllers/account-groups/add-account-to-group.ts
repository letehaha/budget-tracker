import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import type { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import * as accountGroupService from '@services/account-groups';
import { z } from 'zod';

export const addAccountToGroup = async (req, res: CustomResponse) => {
  try {
    const { accountId, groupId }: AddAccountToGroupParams['params'] = req.validated.params;

    const grouping = await accountGroupService.addAccountToGroup({
      accountId,
      groupId,
    });

    return res.status(201).json({
      status: API_RESPONSE_STATUS.success,
      response: grouping,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const addAccountToGroupSchema = z.object({
  params: z.object({
    accountId: recordId(),
    groupId: recordId(),
  }),
});

type AddAccountToGroupParams = z.infer<typeof addAccountToGroupSchema>;
