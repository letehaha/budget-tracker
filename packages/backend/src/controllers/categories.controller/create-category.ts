import { CATEGORY_TYPES } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import * as categoriesService from '@root/services/categories/create-category';
import * as onboardingService from '@services/user-settings/onboarding';
import { z } from 'zod';

const CreateCategoryPayloadSchema = z
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

const schema = z.object({
  body: CreateCategoryPayloadSchema,
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { name, imageUrl, color, parentId } = body;

  const data = await categoriesService.createCategory({
    name,
    imageUrl,
    color,
    parentId,
    userId,
  });

  // Mark onboarding task as complete (fire and forget)
  onboardingService.markTaskComplete({ userId, taskId: 'create-category' }).catch(() => {});

  return { data };
});
