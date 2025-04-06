import { API_RESPONSE_STATUS, CATEGORY_TYPES } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import * as categoriesService from '@root/services/categories/create-category';
import { z } from 'zod';

import { errorHandler } from '../helpers';

export const createCategory = async (req, res: CustomResponse) => {
  const { id: userId } = req.user;
  const { name, imageUrl, color, parentId }: CreateCategoryParams = req.validated.body;

  try {
    const data = await categoriesService.createCategory({
      name,
      imageUrl,
      color,
      parentId,
      userId,
    });

    return res.status(200).json({
      status: API_RESPONSE_STATUS.success,
      response: data,
    });
  } catch (err) {
    errorHandler(res, err as Error);
  }
};

export const CreateCategoryPayloadSchema = z
  .object({
    name: z.string().min(1).max(200, 'The name must not exceed 200 characters'),
    imageUrl: z.string().url().max(500, 'The URL must not exceed 500 characters').optional(),
    type: z.enum(Object.values(CATEGORY_TYPES) as [string, ...string[]]).default(CATEGORY_TYPES.custom),
  })
  .and(
    z.union([
      z.object({
        parentId: z.number().positive().int(),
        color: z
          .string()
          .regex(/^#[0-9A-F]{6}$/i)
          .optional(),
      }),
      z.object({
        parentId: z.undefined(),
        color: z.string().regex(/^#[0-9A-F]{6}$/i),
      }),
    ]),
  );

export const createCategorySchema = z.object({
  body: CreateCategoryPayloadSchema,
});

type CreateCategoryParams = z.infer<typeof CreateCategoryPayloadSchema>;
