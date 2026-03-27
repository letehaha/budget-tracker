import { createController } from '@controllers/helpers/controller-factory';
import * as tagSuggestionsService from '@services/tag-suggestions/tag-suggestions.service';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const count = await tagSuggestionsService.getSuggestionsCount({
    userId: user.id,
  });

  return { data: { count } };
});
