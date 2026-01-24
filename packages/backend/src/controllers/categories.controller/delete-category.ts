import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as categoriesService from '@services/categories/delete-category';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
  body: z
    .object({
      replaceWithCategoryId: recordId().optional(),
    })
    .optional(),
});

export default createController(schema, async ({ user, params, body }) => {
  const { id: userId } = user;
  const { id: categoryId } = params;

  await categoriesService.deleteCategory({
    categoryId,
    userId,
    replaceWithCategoryId: body?.replaceWithCategoryId,
  });
});
