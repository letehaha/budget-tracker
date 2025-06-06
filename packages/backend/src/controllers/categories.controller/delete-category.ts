import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as categoriesService from '@services/categories/delete-category';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    id: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const { id: userId } = user;
  const { id: categoryId } = params;

  await categoriesService.deleteCategory({
    categoryId,
    userId,
  });
});
