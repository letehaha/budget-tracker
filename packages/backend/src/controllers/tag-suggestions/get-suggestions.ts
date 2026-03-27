import { createController } from '@controllers/helpers/controller-factory';
import * as tagSuggestionsService from '@services/tag-suggestions/tag-suggestions.service';
import { z } from 'zod';

const schema = z.object({
  query: z
    .object({
      limit: z.coerce.number().int().positive().max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    })
    .optional(),
});

export default createController(schema, async ({ user, query }) => {
  const data = await tagSuggestionsService.getSuggestions({
    userId: user.id,
    limit: query?.limit,
    offset: query?.offset,
  });

  return { data };
});
