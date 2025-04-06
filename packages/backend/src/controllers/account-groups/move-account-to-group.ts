import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import type { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import * as accountGroupService from '@services/account-groups';
import { z } from 'zod';

export const moveAccountGroup = async (req, res: CustomResponse) => {
  try {
    const { id: userId } = req.user;
    const { groupId }: MoveAccountGroupParams['params'] = req.validated.params;
    const { newParentGroupId }: MoveAccountGroupParams['body'] = req.validated.body;

    const [updatedCount, updatedGroups] = await accountGroupService.moveAccountGroup({
      groupId,
      newParentGroupId,
      userId,
    });

    if (updatedCount === 0) {
      return res.status(404).json({ status: API_RESPONSE_STATUS.error });
    }

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: updatedGroups[0],
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const moveAccountGroupSchema = z.object({
  params: z.object({ groupId: recordId() }),
  body: z.object({ newParentGroupId: recordId().nullable() }),
});

type MoveAccountGroupParams = z.infer<typeof moveAccountGroupSchema>;
