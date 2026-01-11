import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as tagsService from '@services/tags';
import { z } from 'zod';

export const getTags = createController(z.object({}), async ({ user }) => {
  const data = await tagsService.getTags({ userId: user.id });
  return { data };
});

export const getTagById = createController(
  z.object({ params: z.object({ id: recordId() }) }),
  async ({ user, params }) => {
    const data = await tagsService.getTagById({ id: params.id, userId: user.id });
    return { data };
  },
);
