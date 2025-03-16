import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import * as categoriesService from '@services/categories/edit-category';
import { z } from 'zod';

import { errorHandler } from '../helpers';

export const editCategory = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { id: categoryId }: UpdateCategoryParams = req.params;
  const { name, imageUrl, color }: UpdateCategoryPayload = req.validated.body;

  try {
    const data = await categoriesService.editCategory({
      categoryId: Number(categoryId),
      userId,
      name,
      imageUrl,
      color,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const bodyZodSchema = z
  .object({
    name: z.string().min(1).max(200, 'The name must not exceed 200 characters').optional(),
    imageUrl: z.string().url().max(500, 'The URL must not exceed 500 characters').optional(),
    color: z
      .string()
      .regex(/^#[0-9A-F]{6}$/i)
      .optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  });

const paramsZodSchema = z.object({
  id: z.string().refine((val) => !isNaN(Number(val)), {
    message: 'ID must be a valid number',
  }),
});

export const updateCategorySchema = z.object({
  body: bodyZodSchema,
  params: paramsZodSchema,
});

export type UpdateCategoryPayload = z.infer<typeof bodyZodSchema>;
export type UpdateCategoryParams = z.infer<typeof paramsZodSchema>;
