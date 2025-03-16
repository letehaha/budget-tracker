import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { recordArrayIds, recordId } from '@common/lib/zod/custom-types';
import type { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import * as accountGroupService from '@services/account-groups';
import { z } from 'zod';

export const removeAccountFromGroup = async (req, res: CustomResponse) => {
  try {
    const { groupId }: RemoveAccountFromGroupParams['params'] = req.validated.params;
    const { accountIds }: RemoveAccountFromGroupParams['body'] = req.validated.body;

    await accountGroupService.removeAccountFromGroup({
      accountIds,
      groupId,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const removeAccountFromGroupSchema = z.object({
  params: z.object({
    groupId: recordId(),
  }),
  body: z.object({
    accountIds: recordArrayIds(),
  }),
});

type RemoveAccountFromGroupParams = z.infer<typeof removeAccountFromGroupSchema>;
