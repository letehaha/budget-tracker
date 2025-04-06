import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { editExcludedCategories } from '@services/user-settings/edit-excluded-categories';
import { z } from 'zod';

export const editExcludedCategoriesHandler = async (req, res: CustomResponse) => {
  try {
    const { addIds, removeIds } = req.validated.body;
    const { user } = req;

    const updatedCategories = await editExcludedCategories({
      userId: user.id,
      addIds,
      removeIds,
    });

    res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: updatedCategories,
    });
  } catch (error) {
    errorHandler(res, error as Error);
  }
};

export const editExcludedCategoriesSchema = z.object({
  body: z.object({
    addIds: z.array(recordId()).optional().default([]),
    removeIds: z.array(recordId()).optional().default([]),
  }),
});
