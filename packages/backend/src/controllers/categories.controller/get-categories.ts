import { createController } from '@controllers/helpers/controller-factory';
import * as categoriesService from '@services/categories.service';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const { id: userId } = user;

  const data = await categoriesService.getCategories({ userId });

  return { data };
});
