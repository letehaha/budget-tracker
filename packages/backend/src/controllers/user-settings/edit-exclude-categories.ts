import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { editExcludedCategories } from '@services/user-settings/edit-excluded-categories';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    addIds: z.array(recordId()).optional().default([]),
    removeIds: z.array(recordId()).optional().default([]),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const { addIds, removeIds } = body;

  const updatedCategories = await editExcludedCategories({
    userId: user.id,
    addIds,
    removeIds,
  });

  return { data: updatedCategories };
});
