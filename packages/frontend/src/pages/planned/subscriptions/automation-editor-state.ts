import type { RecordId, SubscriptionMatchingRule } from '@bt/shared/types';

/**
 * How a subscription's payments get onto the ledger. `record` (autoRecord) and
 * `match` (matchingRules) are mutually exclusive server-side, so the three modes
 * are modelled as one choice rather than two independent switches.
 */
export const AUTOMATION_MODES = {
  match: 'match',
  record: 'record',
  manual: 'manual',
} as const;

export type AutomationMode = (typeof AUTOMATION_MODES)[keyof typeof AUTOMATION_MODES];

export const deriveAutomationMode = ({
  autoRecord,
  rules,
}: {
  autoRecord: boolean;
  rules: SubscriptionMatchingRule[];
}): AutomationMode => {
  if (autoRecord) return AUTOMATION_MODES.record;
  if (rules.length > 0) return AUTOMATION_MODES.match;
  return AUTOMATION_MODES.manual;
};

/**
 * Drops rules the user added but never filled in, and trims blank keywords out of the rules
 * that stay – the API rejects both an unmatchable rule and a blank keyword inside a kept one.
 */
export const filterEmptyMatchingRules = ({
  rules,
}: {
  rules: SubscriptionMatchingRule[];
}): SubscriptionMatchingRule[] =>
  rules.reduce<SubscriptionMatchingRule[]>((kept, rule) => {
    if (rule.field === 'note') {
      const keywords = (rule.value as string[])
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0);
      if (keywords.length > 0) kept.push({ ...rule, value: keywords });
      return kept;
    }
    if (rule.field === 'amount') {
      const range = rule.value as { min: number; max: number };
      if (range.min > 0 || range.max > 0) kept.push(rule);
      return kept;
    }
    if (rule.value !== 0 && rule.value !== '') kept.push(rule);
    return kept;
  }, []);

interface AutomationPayload {
  autoRecord: boolean;
  matchingRules: { rules: SubscriptionMatchingRule[] };
  accountId: RecordId | null;
}

export const buildAutomationPayload = ({
  mode,
  rules,
  accountId,
}: {
  mode: AutomationMode;
  rules: SubscriptionMatchingRule[];
  accountId: string | null;
}): AutomationPayload => ({
  autoRecord: mode === AUTOMATION_MODES.record,
  matchingRules: { rules: mode === AUTOMATION_MODES.match ? filterEmptyMatchingRules({ rules }) : [] },
  accountId: (accountId || null) as RecordId | null,
});
