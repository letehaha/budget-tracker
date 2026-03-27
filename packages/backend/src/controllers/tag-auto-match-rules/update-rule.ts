import { TAG_RULE_APPROVAL_MODE } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as autoMatchRulesService from '@services/tag-auto-matching/auto-match-rules.service';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    tagId: recordId(),
    id: z.string().uuid(),
  }),
  body: z.object({
    approvalMode: z.nativeEnum(TAG_RULE_APPROVAL_MODE).optional(),
    codePattern: z.string().min(1).max(500).optional(),
    aiPrompt: z.string().min(1).max(2000).optional(),
    isEnabled: z.boolean().optional(),
  }),
});

export default createController(schema, async ({ user, params, body }) => {
  const data = await autoMatchRulesService.updateRule({
    userId: user.id,
    tagId: params.tagId,
    ruleId: params.id,
    ...body,
  });

  return { data };
});
