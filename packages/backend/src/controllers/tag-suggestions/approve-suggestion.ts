import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as tagSuggestionsService from '@services/tag-suggestions/tag-suggestions.service';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    transactionId: recordId(),
    tagId: recordId(),
  }),
});

export default createController(schema, async ({ user, body }) => {
  await tagSuggestionsService.approveSuggestion({
    userId: user.id,
    transactionId: body.transactionId,
    tagId: body.tagId,
  });

  return { data: { message: 'Suggestion approved' } };
});
