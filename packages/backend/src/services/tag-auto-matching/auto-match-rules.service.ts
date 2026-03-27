import { TAG_RULE_APPROVAL_MODE, TAG_RULE_TYPE } from '@bt/shared/types';
import { ConflictError, NotFoundError, ValidationError } from '@js/errors';
import TagAutoMatchRules from '@models/tag-auto-match-rules.model';
import Tags from '@models/tags.model';
import { withTransaction } from '@services/common/with-transaction';

const MAX_CODE_RULES_PER_TAG = 5;
const MAX_AI_RULES_PER_TAG = 1;

type CreateRuleParams = {
  userId: number;
  tagId: number;
  approvalMode?: TAG_RULE_APPROVAL_MODE;
} & (
  | { type: TAG_RULE_TYPE.code; codePattern: string; aiPrompt?: never }
  | { type: TAG_RULE_TYPE.ai; aiPrompt: string; codePattern?: never }
);

export const createRule = withTransaction(async (params: CreateRuleParams) => {
  const { userId, tagId, type, codePattern, aiPrompt } = params;

  // Default approval mode: auto for code, manual for AI
  const approvalMode =
    params.approvalMode ?? (type === TAG_RULE_TYPE.code ? TAG_RULE_APPROVAL_MODE.auto : TAG_RULE_APPROVAL_MODE.manual);

  // Verify tag exists and belongs to user
  const tag = await Tags.findOne({ where: { id: tagId, userId } });
  if (!tag) {
    throw new NotFoundError({ message: 'Tag not found' });
  }

  // Check rule count limits
  const existingCount = await TagAutoMatchRules.count({
    where: { userId, tagId, type },
  });

  if (type === TAG_RULE_TYPE.code && existingCount >= MAX_CODE_RULES_PER_TAG) {
    throw new ValidationError({
      message: `Maximum ${MAX_CODE_RULES_PER_TAG} code-based rules per tag`,
    });
  }

  if (type === TAG_RULE_TYPE.ai && existingCount >= MAX_AI_RULES_PER_TAG) {
    throw new ConflictError({
      message: 'Only one AI-based rule is allowed per tag',
    });
  }

  const rule = await TagAutoMatchRules.create({
    userId,
    tagId,
    type,
    approvalMode,
    codePattern: type === TAG_RULE_TYPE.code ? codePattern : null,
    aiPrompt: type === TAG_RULE_TYPE.ai ? aiPrompt : null,
  });

  return rule;
});

interface GetRulesForTagParams {
  userId: number;
  tagId: number;
}

export const getRulesForTag = async ({ userId, tagId }: GetRulesForTagParams) => {
  return TagAutoMatchRules.findAll({
    where: { userId, tagId },
    order: [['createdAt', 'ASC']],
  });
};

interface UpdateRuleParams {
  userId: number;
  tagId: number;
  ruleId: string;
  approvalMode?: TAG_RULE_APPROVAL_MODE;
  codePattern?: string;
  aiPrompt?: string;
  isEnabled?: boolean;
}

export const updateRule = withTransaction(async (params: UpdateRuleParams) => {
  const { userId, tagId, ruleId, ...updates } = params;

  const rule = await TagAutoMatchRules.findOne({
    where: { id: ruleId, userId, tagId },
  });

  if (!rule) {
    throw new NotFoundError({ message: 'Rule not found' });
  }

  const updateFields: Partial<TagAutoMatchRules> = {};

  if (updates.approvalMode !== undefined) {
    updateFields.approvalMode = updates.approvalMode;
  }
  if (updates.isEnabled !== undefined) {
    updateFields.isEnabled = updates.isEnabled;
  }
  if (updates.codePattern !== undefined && rule.type === TAG_RULE_TYPE.code) {
    updateFields.codePattern = updates.codePattern;
  }
  if (updates.aiPrompt !== undefined && rule.type === TAG_RULE_TYPE.ai) {
    updateFields.aiPrompt = updates.aiPrompt;
  }

  await rule.update(updateFields);

  return rule;
});

interface DeleteRuleParams {
  userId: number;
  tagId: number;
  ruleId: string;
}

export const deleteRule = withTransaction(async ({ userId, tagId, ruleId }: DeleteRuleParams) => {
  const rule = await TagAutoMatchRules.findOne({
    where: { id: ruleId, userId, tagId },
  });

  if (!rule) {
    throw new NotFoundError({ message: 'Rule not found' });
  }

  await rule.destroy();
});

interface ToggleRuleParams {
  userId: number;
  tagId: number;
  ruleId: string;
}

export const toggleRule = withTransaction(async ({ userId, tagId, ruleId }: ToggleRuleParams) => {
  const rule = await TagAutoMatchRules.findOne({
    where: { id: ruleId, userId, tagId },
  });

  if (!rule) {
    throw new NotFoundError({ message: 'Rule not found' });
  }

  await rule.update({ isEnabled: !rule.isEnabled });

  return rule;
});
