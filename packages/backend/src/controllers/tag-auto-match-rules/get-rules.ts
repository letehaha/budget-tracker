import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as autoMatchRulesService from '@services/tag-auto-matching/auto-match-rules.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    tagId: recordId(),
  }),
});

export default createController(schema, async ({ user, params }) => {
  const data = await autoMatchRulesService.getRulesForTag({
    userId: user.id,
    tagId: params.tagId,
  });

  return { data };
});
