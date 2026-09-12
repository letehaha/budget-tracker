import { type AutomationAction, CATEGORIZATION_SOURCE, type RecordId, type TransactionModel } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import {
  type AutomationApplyRule,
  type AutomationMatchBadgeKey,
  getBadgeKey,
  isLocked,
  isPreselected,
} from './apply-to-history-selection';

const RULE_ID = 'rule-1' as RecordId;
const OTHER_RULE_ID = 'rule-2' as RecordId;

const rule = ({ actions }: { actions: AutomationAction[] }): AutomationApplyRule => ({ actions });

const setCategory: AutomationAction = { type: 'set_category', categoryId: 'cat-1' as RecordId };
const addTags: AutomationAction = { type: 'add_tags', tagIds: ['tag-1' as RecordId] };

const RULES = {
  categoryOnly: rule({ actions: [setCategory] }),
  tagsOnly: rule({ actions: [addTags] }),
  mixed: rule({ actions: [setCategory, addTags] }),
};

const tx = ({ source, ruleId }: { source?: CATEGORIZATION_SOURCE; ruleId?: RecordId }): TransactionModel =>
  ({ id: 'tx-1' as RecordId, categorizationMeta: source ? { source, ruleId } : null }) as TransactionModel;

/** `preselected` is the expectation for rules the row is not locked for; a locked row is never preselected. */
const CASES: {
  name: string;
  tx: TransactionModel;
  badge: AutomationMatchBadgeKey | null;
  lockedWhenCategoryOnly: boolean;
  preselected: boolean;
}[] = [
  {
    name: 'manual',
    tx: tx({ source: CATEGORIZATION_SOURCE.manual }),
    badge: 'manual',
    lockedWhenCategoryOnly: true,
    preselected: false,
  },
  {
    name: 'ai',
    tx: tx({ source: CATEGORIZATION_SOURCE.ai }),
    badge: 'ai',
    lockedWhenCategoryOnly: false,
    preselected: false,
  },
  {
    name: 'mcc rule',
    tx: tx({ source: CATEGORIZATION_SOURCE.mccRule }),
    badge: null,
    lockedWhenCategoryOnly: false,
    preselected: true,
  },
  {
    name: 'payee rule',
    tx: tx({ source: CATEGORIZATION_SOURCE.payeeRule }),
    badge: null,
    lockedWhenCategoryOnly: false,
    preselected: true,
  },
  {
    name: 'subscription rule',
    tx: tx({ source: CATEGORIZATION_SOURCE.subscriptionRule }),
    badge: 'subscriptionKept',
    lockedWhenCategoryOnly: true,
    preselected: true,
  },
  {
    name: 'this rule',
    tx: tx({ source: CATEGORIZATION_SOURCE.userRule, ruleId: RULE_ID }),
    badge: null,
    lockedWhenCategoryOnly: false,
    preselected: true,
  },
  {
    name: 'another rule',
    tx: tx({ source: CATEGORIZATION_SOURCE.userRule, ruleId: OTHER_RULE_ID }),
    badge: null,
    lockedWhenCategoryOnly: false,
    preselected: true,
  },
  { name: 'uncategorized', tx: tx({}), badge: null, lockedWhenCategoryOnly: false, preselected: true },
];

describe('apply-to-history selection policy', () => {
  it.each(CASES)('badges a $name transaction', ({ tx: transaction, badge }) => {
    expect(getBadgeKey({ tx: transaction })).toBe(badge);
  });

  it.each(CASES)(
    'locks a $name transaction only for category-only rules',
    ({ tx: transaction, lockedWhenCategoryOnly }) => {
      expect(isLocked({ tx: transaction, rule: RULES.categoryOnly })).toBe(lockedWhenCategoryOnly);
      expect(isLocked({ tx: transaction, rule: RULES.tagsOnly })).toBe(false);
      expect(isLocked({ tx: transaction, rule: RULES.mixed })).toBe(false);
    },
  );

  it.each(CASES)('preselects a $name transaction', ({ tx: transaction, preselected, lockedWhenCategoryOnly }) => {
    expect(isPreselected({ tx: transaction, rule: RULES.categoryOnly })).toBe(preselected && !lockedWhenCategoryOnly);
    expect(isPreselected({ tx: transaction, rule: RULES.tagsOnly })).toBe(preselected);
    expect(isPreselected({ tx: transaction, rule: RULES.mixed })).toBe(preselected);
  });
});
