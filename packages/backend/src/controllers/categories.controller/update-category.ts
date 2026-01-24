import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as categoriesService from '@services/categories/edit-category';
import { z } from 'zod';

const schema = z.object({
  body: z
    .object({
      name: z.string().min(1).max(200, 'The name must not exceed 200 characters').optional(),
      icon: z.string().max(50, 'Icon name must not exceed 50 characters').nullable().optional(),
      color: z
        .string()
        .regex(/^#[0-9A-F]{6}$/i)
        .optional(),
    })
    .refine((data) => Object.values(data).some((value) => value !== undefined), {
      message: 'At least one field must be provided',
    }),
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const { id: userId } = user;
  const { id: categoryId } = params;
  const { name, icon, color } = body;

  const data = await categoriesService.editCategory({
    categoryId: Number(categoryId),
    userId,
    name,
    icon,
    color,
  });

  return { data };
});
