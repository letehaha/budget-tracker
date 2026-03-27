import { TAG_RULE_APPROVAL_MODE, TAG_RULE_TYPE } from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import * as autoMatchRulesService from '@services/tag-auto-matching/auto-match-rules.service';
import { z } from 'zod';

const schema = z
  .object({
    params: z.object({
      tagId: recordId(),
    }),
    body: z.object({
      type: z.nativeEnum(TAG_RULE_TYPE),
      approvalMode: z.nativeEnum(TAG_RULE_APPROVAL_MODE).optional(),
      codePattern: z.string().min(1).max(500).optional(),
      aiPrompt: z.string().min(1).max(2000).optional(),
    }),
  })
  .refine(
    (data) => {
      if (data.body.type === TAG_RULE_TYPE.code && !data.body.codePattern) return false;
      if (data.body.type === TAG_RULE_TYPE.ai && !data.body.aiPrompt) return false;
      return true;
    },
    { message: 'codePattern is required for code rules, aiPrompt is required for AI rules' },
  );

export default createController(schema, async ({ user, params, body }) => {
  const baseParams = {
    userId: user.id,
    tagId: params.tagId,
    approvalMode: body.approvalMode,
  };

  const data = await autoMatchRulesService.createRule(
    body.type === TAG_RULE_TYPE.code
      ? { ...baseParams, type: TAG_RULE_TYPE.code, codePattern: body.codePattern! }
      : { ...baseParams, type: TAG_RULE_TYPE.ai, aiPrompt: body.aiPrompt! },
  );

  return { data };
});
