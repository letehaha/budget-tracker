import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as tagSuggestionsService from '@services/tag-suggestions/tag-suggestions.service';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          transactionId: recordId(),
          tagId: recordId(),
        }),
      )
      .min(1)
      .max(500),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const data = await tagSuggestionsService.bulkApprove({
    userId: user.id,
    items: body.items,
  });

  return { data };
});
