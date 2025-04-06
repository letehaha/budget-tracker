import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import * as categoriesService from '@services/categories/delete-category';
import { z } from 'zod';

import { errorHandler } from '../helpers';

export const deleteCategory = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { id: categoryId }: DeleteCategoryParams = req.params;

  try {
    await categoriesService.deleteCategory({
      categoryId: Number(categoryId),
      userId,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

const paramsZodSchema = z.object({
  id: z.string().refine((val) => !isNaN(Number(val)), {
    message: 'ID must be a valid number',
  }),
});

export const deleteCategorySchema = z.object({
  params: paramsZodSchema,
});

export type DeleteCategoryParams = z.infer<typeof paramsZodSchema>;
