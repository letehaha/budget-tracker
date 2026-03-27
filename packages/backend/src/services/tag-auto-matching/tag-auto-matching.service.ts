import { TAG_RULE_APPROVAL_MODE, TAG_RULE_TYPE, TAG_SUGGESTION_SOURCE } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import TagAutoMatchRules from '@models/tag-auto-match-rules.model';
import TagSuggestionDismissals from '@models/tag-suggestion-dismissals.model';
import TagSuggestions from '@models/tag-suggestions.model';
import Tags from '@models/tags.model';
import TransactionTags from '@models/transaction-tags.model';
import Transactions from '@models/transactions.model';
import { TagSuggestionResult } from '@services/ai-categorization/types';
import { Op } from 'sequelize';

import { buildTagsForPrompt, TagForAIMatching } from './build-tag-prompt';
import { runCodeMatching } from './code-matcher';

interface TagMatchResult {
  appliedCount: number;
  suggestedCount: number;
}

/**
 * Load existing tag assignments and dismissals for a set of transactions.
 * Used by both code-based and AI-based matching to skip already-handled pairs.
 */
async function loadExclusionSets({
  userId,
  transactionIds,
}: {
  userId: number;
  transactionIds: number[];
}): Promise<{ existingTagSet: Set<string>; dismissalSet: Set<string> }> {
  const existingTags = await TransactionTags.findAll({
    where: { transactionId: { [Op.in]: transactionIds } },
    attributes: ['transactionId', 'tagId'],
    raw: true,
  });
  const existingTagSet = new Set(existingTags.map((t) => `${t.transactionId}:${t.tagId}`));

  const dismissals = await TagSuggestionDismissals.findAll({
    where: { userId, transactionId: { [Op.in]: transactionIds } },
    attributes: ['transactionId', 'tagId'],
    raw: true,
  });
  const dismissalSet = new Set(dismissals.map((d) => `${d.transactionId}:${d.tagId}`));

  return { existingTagSet, dismissalSet };
}

/**
 * Apply a tag directly or create a suggestion based on the rule's approval mode.
 * Returns whether it was applied ('applied'), suggested ('suggested'), or skipped (null).
 */
async function applyOrSuggest({
  userId,
  transactionId,
  tagId,
  ruleId,
  source,
  approvalMode,
  existingTagSet,
  dismissalSet,
}: {
  userId: number;
  transactionId: number;
  tagId: number;
  ruleId: string;
  source: TAG_SUGGESTION_SOURCE;
  approvalMode: TAG_RULE_APPROVAL_MODE;
  existingTagSet: Set<string>;
  dismissalSet: Set<string>;
}): Promise<'applied' | 'suggested' | null> {
  const key = `${transactionId}:${tagId}`;

  if (existingTagSet.has(key) || dismissalSet.has(key)) return null;

  if (approvalMode === TAG_RULE_APPROVAL_MODE.auto) {
    await TransactionTags.findOrCreate({
      where: { tagId, transactionId },
    });
    existingTagSet.add(key);
    return 'applied';
  }

  await TagSuggestions.findOrCreate({
    where: { userId, transactionId, tagId },
    defaults: { userId, transactionId, tagId, ruleId, source },
  });
  return 'suggested';
}

/**
 * Run code-based tag matching on a batch of transactions.
 * Applies tags directly for auto-mode rules, creates suggestions for manual-mode rules.
 * Returns applied/suggested counts.
 */
export async function runCodeBasedMatching({
  userId,
  transactionIds,
}: {
  userId: number;
  transactionIds: number[];
}): Promise<TagMatchResult> {
  // Load enabled code-based rules for this user
  const codeRules = await TagAutoMatchRules.findAll({
    where: { userId, type: TAG_RULE_TYPE.code, isEnabled: true },
  });

  if (codeRules.length === 0) {
    return { appliedCount: 0, suggestedCount: 0 };
  }

  // Load transactions
  const transactions = await Transactions.findAll({
    where: { id: { [Op.in]: transactionIds }, userId },
    attributes: ['id', 'note'],
    raw: true,
  });

  const { existingTagSet, dismissalSet } = await loadExclusionSets({ userId, transactionIds });

  // Run fuzzy matching
  const matches = runCodeMatching({ transactions, rules: codeRules });

  let appliedCount = 0;
  let suggestedCount = 0;

  const ruleMap = new Map(codeRules.map((r) => [r.id, r]));

  for (const match of matches) {
    const rule = ruleMap.get(match.ruleId);
    if (!rule) continue;

    try {
      const result = await applyOrSuggest({
        userId,
        transactionId: match.transactionId,
        tagId: match.tagId,
        ruleId: match.ruleId,
        source: TAG_SUGGESTION_SOURCE.code,
        approvalMode: rule.approvalMode,
        existingTagSet,
        dismissalSet,
      });

      if (result === 'applied') appliedCount++;
      else if (result === 'suggested') suggestedCount++;
    } catch (error) {
      logger.warn('[Tag Matching] Failed to process code match, skipping', {
        error: String(error),
      });
    }
  }

  logger.info('[Tag Matching] Code-based matching completed', {
    userId,
    transactionCount: transactions.length,
    ruleCount: codeRules.length,
    matchCount: matches.length,
    appliedCount,
    suggestedCount,
  });

  return { appliedCount, suggestedCount };
}

/**
 * Get AI tag rules and build the tags payload for the combined AI call.
 * Returns null if no AI tag rules exist.
 */
export async function getAITagRulesForUser({
  userId,
}: {
  userId: number;
}): Promise<{ tags: TagForAIMatching[]; rules: TagAutoMatchRules[] } | null> {
  const aiRules = await TagAutoMatchRules.findAll({
    where: { userId, type: TAG_RULE_TYPE.ai, isEnabled: true },
  });

  if (aiRules.length === 0) return null;

  const tagIds = aiRules.map((r) => r.tagId);
  const tags = await Tags.findAll({
    where: { id: { [Op.in]: tagIds } },
  });

  const tagsForPrompt = buildTagsForPrompt({ rules: aiRules, tags });
  if (tagsForPrompt.length === 0) return null;

  return { tags: tagsForPrompt, rules: aiRules };
}

/**
 * Process AI tag suggestions returned from the combined categorization call.
 * Applies tags directly for auto-mode rules, creates suggestions for manual-mode rules.
 */
export async function processAITagSuggestions({
  userId,
  suggestions,
  aiRules,
  transactionIds,
}: {
  userId: number;
  suggestions: TagSuggestionResult[];
  aiRules: TagAutoMatchRules[];
  transactionIds: number[];
}): Promise<TagMatchResult> {
  if (suggestions.length === 0) {
    return { appliedCount: 0, suggestedCount: 0 };
  }

  const { existingTagSet, dismissalSet } = await loadExclusionSets({ userId, transactionIds });

  // Build rule lookup by tagId (since AI rules are 1 per tag)
  const ruleByTagId = new Map(aiRules.map((r) => [r.tagId, r]));

  let appliedCount = 0;
  let suggestedCount = 0;

  for (const suggestion of suggestions) {
    const rule = ruleByTagId.get(suggestion.tagId);
    if (!rule) continue;

    try {
      const result = await applyOrSuggest({
        userId,
        transactionId: suggestion.transactionId,
        tagId: suggestion.tagId,
        ruleId: rule.id,
        source: TAG_SUGGESTION_SOURCE.ai,
        approvalMode: rule.approvalMode,
        existingTagSet,
        dismissalSet,
      });

      if (result === 'applied') appliedCount++;
      else if (result === 'suggested') suggestedCount++;
    } catch (error) {
      logger.warn('[Tag Matching] Failed to process AI suggestion, skipping', {
        error: String(error),
      });
    }
  }

  logger.info('[Tag Matching] AI-based matching completed', {
    userId,
    suggestionCount: suggestions.length,
    appliedCount,
    suggestedCount,
  });

  return { appliedCount, suggestedCount };
}
