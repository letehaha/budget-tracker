import {
  AUTOMATION_PROTECTED_CATEGORY_SOURCES,
  CATEGORIZATION_SOURCE,
  type TransactionAutomationModel,
  type TransactionModel,
} from '@bt/shared/types';

export type AutomationMatchBadgeKey = 'manual' | 'ai' | 'subscriptionKept';

export type AutomationApplyRule = Pick<TransactionAutomationModel, 'actions'>;

export const getBadgeKey = ({ tx }: { tx: TransactionModel }): AutomationMatchBadgeKey | null => {
  const source = tx.categorizationMeta?.source;

  switch (source) {
    case CATEGORIZATION_SOURCE.manual:
      return 'manual';
    case CATEGORIZATION_SOURCE.ai:
      return 'ai';
    case CATEGORIZATION_SOURCE.subscriptionRule:
      return 'subscriptionKept';
    case CATEGORIZATION_SOURCE.userRule:
    case CATEGORIZATION_SOURCE.mccRule:
    case CATEGORIZATION_SOURCE.payeeRule:
    case undefined:
      return null;
    default:
      source satisfies never;
      return null;
  }
};

/** Mirrors the server: a protected category stamp survives, so a category-only rule would write nothing. */
export const isLocked = ({ tx, rule }: { tx: TransactionModel; rule: AutomationApplyRule }): boolean => {
  const source = tx.categorizationMeta?.source;
  if (!source || !AUTOMATION_PROTECTED_CATEGORY_SOURCES.includes(source)) return false;
  return rule.actions.every((action) => action.type === 'set_category');
};

export const isPreselected = ({ tx, rule }: { tx: TransactionModel; rule: AutomationApplyRule }): boolean => {
  if (isLocked({ tx, rule })) return false;
  const badge = getBadgeKey({ tx });
  return badge !== 'manual' && badge !== 'ai';
};
