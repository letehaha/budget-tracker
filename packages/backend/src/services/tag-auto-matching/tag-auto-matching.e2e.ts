import { TAG_RULE_APPROVAL_MODE, TAG_RULE_TYPE, TAG_SUGGESTION_SOURCE } from '@bt/shared/types';
import { describe, expect, it, beforeEach } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import TagSuggestions from '@models/tag-suggestions.model';
import * as helpers from '@tests/helpers';

describe('Tag Auto-Match Rules API', () => {
  describe('POST /tags/:tagId/auto-match-rules (createRule)', () => {
    it('creates a code-based rule', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });

      const rule = await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: {
          type: TAG_RULE_TYPE.code,
          codePattern: 'netflix',
          approvalMode: TAG_RULE_APPROVAL_MODE.auto,
        },
        raw: true,
      });

      expect(rule.id).toBeDefined();
      expect(rule.type).toBe(TAG_RULE_TYPE.code);
      expect(rule.codePattern).toBe('netflix');
      expect(rule.approvalMode).toBe(TAG_RULE_APPROVAL_MODE.auto);
      expect(rule.isEnabled).toBe(true);
      expect(rule.aiPrompt).toBeNull();
    });

    it('creates an AI-based rule', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });

      const rule = await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: {
          type: TAG_RULE_TYPE.ai,
          aiPrompt: 'Anything related to car expenses',
          approvalMode: TAG_RULE_APPROVAL_MODE.manual,
        },
        raw: true,
      });

      expect(rule.id).toBeDefined();
      expect(rule.type).toBe(TAG_RULE_TYPE.ai);
      expect(rule.aiPrompt).toBe('Anything related to car expenses');
      expect(rule.codePattern).toBeNull();
    });

    it('enforces max 5 code rules per tag', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });

      for (let i = 0; i < 5; i++) {
        await helpers.createAutoMatchRule({
          tagId: tag.id,
          payload: { type: TAG_RULE_TYPE.code, codePattern: `pattern-${i}` },
          raw: true,
        });
      }

      const response = await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'one-too-many' },
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('enforces max 1 AI rule per tag', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });

      await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: { type: TAG_RULE_TYPE.ai, aiPrompt: 'first prompt' },
        raw: true,
      });

      const response = await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: { type: TAG_RULE_TYPE.ai, aiPrompt: 'second prompt' },
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
    });

    it('fails for non-existent tag', async () => {
      const response = await helpers.createAutoMatchRule({
        tagId: 999999,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'test' },
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('GET /tags/:tagId/auto-match-rules (getRules)', () => {
    it('returns all rules for a tag', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });

      await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'netflix' },
        raw: true,
      });
      await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: { type: TAG_RULE_TYPE.ai, aiPrompt: 'subscriptions' },
        raw: true,
      });

      const rules = await helpers.getAutoMatchRules({ tagId: tag.id, raw: true });

      expect(rules).toHaveLength(2);
    });

    it('returns empty array for tag with no rules', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });
      const rules = await helpers.getAutoMatchRules({ tagId: tag.id, raw: true });

      expect(rules).toHaveLength(0);
    });
  });

  describe('PUT /tags/:tagId/auto-match-rules/:id (updateRule)', () => {
    it('updates a code-based rule pattern', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });
      const rule = await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'old-pattern' },
        raw: true,
      });

      const updated = await helpers.updateAutoMatchRule({
        tagId: tag.id,
        id: rule.id,
        payload: { codePattern: 'new-pattern' },
        raw: true,
      });

      expect(updated.codePattern).toBe('new-pattern');
    });

    it('updates approval mode', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });
      const rule = await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'test', approvalMode: TAG_RULE_APPROVAL_MODE.auto },
        raw: true,
      });

      const updated = await helpers.updateAutoMatchRule({
        tagId: tag.id,
        id: rule.id,
        payload: { approvalMode: TAG_RULE_APPROVAL_MODE.manual },
        raw: true,
      });

      expect(updated.approvalMode).toBe(TAG_RULE_APPROVAL_MODE.manual);
    });
  });

  describe('PATCH /tags/:tagId/auto-match-rules/:id/toggle (toggleRule)', () => {
    it('toggles rule enabled state', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });
      const rule = await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'test' },
        raw: true,
      });

      expect(rule.isEnabled).toBe(true);

      const toggled = await helpers.toggleAutoMatchRule({ tagId: tag.id, id: rule.id, raw: true });
      expect(toggled.isEnabled).toBe(false);

      const toggledBack = await helpers.toggleAutoMatchRule({ tagId: tag.id, id: rule.id, raw: true });
      expect(toggledBack.isEnabled).toBe(true);
    });
  });

  describe('DELETE /tags/:tagId/auto-match-rules/:id (deleteRule)', () => {
    it('deletes a rule', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });
      const rule = await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'test' },
        raw: true,
      });

      await helpers.deleteAutoMatchRule({ tagId: tag.id, id: rule.id, raw: true });

      const rules = await helpers.getAutoMatchRules({ tagId: tag.id, raw: true });
      expect(rules).toHaveLength(0);
    });

    it('fails for non-existent rule', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });

      const response = await helpers.deleteAutoMatchRule({
        tagId: tag.id,
        id: '00000000-0000-7000-8000-000000000000',
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });
});

describe('Tag Suggestions API', () => {
  // Helper to seed a suggestion directly in DB (suggestions are normally created by the matching service)
  const seedSuggestion = async ({
    userId,
    transactionId,
    tagId,
    ruleId,
  }: {
    userId: number;
    transactionId: number;
    tagId: number;
    ruleId: string;
  }) => {
    return TagSuggestions.create({
      userId,
      transactionId,
      tagId,
      ruleId,
      source: TAG_SUGGESTION_SOURCE.code,
    });
  };

  describe('GET /tag-suggestions/count', () => {
    it('returns zero when no suggestions exist', async () => {
      const result = await helpers.getTagSuggestionsCount({ raw: true });
      expect(result.count).toBe(0);
    });
  });

  describe('GET /tag-suggestions', () => {
    it('returns empty array when no suggestions exist', async () => {
      const result = await helpers.getTagSuggestions({ raw: true });
      expect(result).toHaveLength(0);
    });
  });

  describe('POST /tag-suggestions/approve', () => {
    it('approves a suggestion — applies tag and removes suggestion', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });
      const rule = await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'test' },
        raw: true,
      });
      const [tx] = await helpers.createTransaction({ raw: true });

      await seedSuggestion({ userId: tx.userId, transactionId: tx.id, tagId: tag.id, ruleId: rule.id });

      // Verify suggestion exists
      const countBefore = await helpers.getTagSuggestionsCount({ raw: true });
      expect(countBefore.count).toBe(1);

      // Approve the suggestion
      await helpers.approveTagSuggestion({ transactionId: tx.id, tagId: tag.id, raw: true });

      // Suggestion should be removed
      const countAfter = await helpers.getTagSuggestionsCount({ raw: true });
      expect(countAfter.count).toBe(0);
    });

    it('returns 404 for non-existent suggestion', async () => {
      const response = await helpers.approveTagSuggestion({
        transactionId: 999999,
        tagId: 999999,
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('POST /tag-suggestions/reject', () => {
    it('rejects a suggestion — creates dismissal and removes suggestion', async () => {
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });
      const rule = await helpers.createAutoMatchRule({
        tagId: tag.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'test' },
        raw: true,
      });
      const [tx] = await helpers.createTransaction({ raw: true });

      await seedSuggestion({ userId: tx.userId, transactionId: tx.id, tagId: tag.id, ruleId: rule.id });

      // Reject the suggestion
      await helpers.rejectTagSuggestion({ transactionId: tx.id, tagId: tag.id, raw: true });

      // Suggestion should be removed
      const countAfter = await helpers.getTagSuggestionsCount({ raw: true });
      expect(countAfter.count).toBe(0);
    });

    it('returns 404 for non-existent suggestion', async () => {
      const response = await helpers.rejectTagSuggestion({
        transactionId: 999999,
        tagId: 999999,
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('POST /tag-suggestions/bulk-approve', () => {
    it('approves multiple suggestions at once', async () => {
      const tag1 = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });
      const tag2 = await helpers.createTag({ payload: helpers.buildTagPayload({ name: 'Tag 2' }), raw: true });
      const rule1 = await helpers.createAutoMatchRule({
        tagId: tag1.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'test1' },
        raw: true,
      });
      const rule2 = await helpers.createAutoMatchRule({
        tagId: tag2.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'test2' },
        raw: true,
      });
      const [tx] = await helpers.createTransaction({ raw: true });

      await seedSuggestion({ userId: tx.userId, transactionId: tx.id, tagId: tag1.id, ruleId: rule1.id });
      await seedSuggestion({ userId: tx.userId, transactionId: tx.id, tagId: tag2.id, ruleId: rule2.id });

      const result = await helpers.bulkApproveTagSuggestions({
        items: [
          { transactionId: tx.id, tagId: tag1.id },
          { transactionId: tx.id, tagId: tag2.id },
        ],
        raw: true,
      });

      expect(result.approvedCount).toBe(2);
      expect(result.skippedCount).toBe(0);

      const countAfter = await helpers.getTagSuggestionsCount({ raw: true });
      expect(countAfter.count).toBe(0);
    });

    it('skips already-resolved suggestions and returns skippedCount', async () => {
      const result = await helpers.bulkApproveTagSuggestions({
        items: [{ transactionId: 999999, tagId: 999999 }],
        raw: true,
      });

      expect(result.approvedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
    });
  });

  describe('POST /tag-suggestions/bulk-reject', () => {
    it('rejects multiple suggestions at once', async () => {
      const tag1 = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });
      const tag2 = await helpers.createTag({ payload: helpers.buildTagPayload({ name: 'Tag 2' }), raw: true });
      const rule1 = await helpers.createAutoMatchRule({
        tagId: tag1.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'test1' },
        raw: true,
      });
      const rule2 = await helpers.createAutoMatchRule({
        tagId: tag2.id,
        payload: { type: TAG_RULE_TYPE.code, codePattern: 'test2' },
        raw: true,
      });
      const [tx] = await helpers.createTransaction({ raw: true });

      await seedSuggestion({ userId: tx.userId, transactionId: tx.id, tagId: tag1.id, ruleId: rule1.id });
      await seedSuggestion({ userId: tx.userId, transactionId: tx.id, tagId: tag2.id, ruleId: rule2.id });

      const result = await helpers.bulkRejectTagSuggestions({
        items: [
          { transactionId: tx.id, tagId: tag1.id },
          { transactionId: tx.id, tagId: tag2.id },
        ],
        raw: true,
      });

      expect(result.rejectedCount).toBe(2);
      expect(result.skippedCount).toBe(0);

      const countAfter = await helpers.getTagSuggestionsCount({ raw: true });
      expect(countAfter.count).toBe(0);
    });

    it('skips already-resolved suggestions and returns skippedCount', async () => {
      const result = await helpers.bulkRejectTagSuggestions({
        items: [{ transactionId: 999999, tagId: 999999 }],
        raw: true,
      });

      expect(result.rejectedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
    });
  });
});
