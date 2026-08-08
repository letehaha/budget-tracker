import { type RecordId, type SubscriptionMatchingRule, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import {
  AUTOMATION_MODES,
  buildAutomationPayload,
  deriveAutomationMode,
  filterEmptyMatchingRules,
} from './automation-editor-state';

const ACCOUNT_ID = '00000000-0000-0000-0000-0000000000aa' as RecordId;

const noteRule = ({ keywords }: { keywords: string[] }): SubscriptionMatchingRule => ({
  field: 'note',
  operator: 'contains_any',
  value: keywords,
});

const amountRule = ({ min, max }: { min: number; max: number }): SubscriptionMatchingRule => ({
  field: 'amount',
  operator: 'between',
  value: { min, max },
});

const transactionTypeRule = ({ value }: { value: string }): SubscriptionMatchingRule => ({
  field: 'transactionType',
  operator: 'equals',
  value,
});

const accountRule = ({ value }: { value: string | number }): SubscriptionMatchingRule => ({
  field: 'accountId',
  operator: 'equals',
  value,
});

describe('deriveAutomationMode', () => {
  it('returns manual when nothing is configured', () => {
    expect(deriveAutomationMode({ autoRecord: false, rules: [] })).toBe(AUTOMATION_MODES.manual);
  });

  it('returns match when rules exist', () => {
    expect(deriveAutomationMode({ autoRecord: false, rules: [noteRule({ keywords: ['netflix'] })] })).toBe(
      AUTOMATION_MODES.match,
    );
  });

  it('returns record when autoRecord is on', () => {
    expect(deriveAutomationMode({ autoRecord: true, rules: [] })).toBe(AUTOMATION_MODES.record);
  });

  it('prefers record over match when both are somehow set', () => {
    expect(deriveAutomationMode({ autoRecord: true, rules: [noteRule({ keywords: ['netflix'] })] })).toBe(
      AUTOMATION_MODES.record,
    );
  });
});

describe('filterEmptyMatchingRules', () => {
  it('keeps a note rule with at least one non-blank keyword, trimmed and without the blanks', () => {
    const rules = [noteRule({ keywords: ['', '  spotify  '] })];
    expect(filterEmptyMatchingRules({ rules })).toEqual([noteRule({ keywords: ['spotify'] })]);
  });

  it('trims every kept keyword and drops the whitespace-only ones', () => {
    const rules = [noteRule({ keywords: [' netflix', '   ', 'hbo  ', ''] })];
    expect(filterEmptyMatchingRules({ rules })).toEqual([noteRule({ keywords: ['netflix', 'hbo'] })]);
  });

  it('does not mutate the rule it was given', () => {
    const rule = noteRule({ keywords: ['', ' spotify '] });
    filterEmptyMatchingRules({ rules: [rule] });
    expect(rule.value).toEqual(['', ' spotify ']);
  });

  it('drops a note rule whose keywords are all blank or whitespace', () => {
    expect(filterEmptyMatchingRules({ rules: [noteRule({ keywords: ['', '   '] })] })).toEqual([]);
  });

  it('drops a note rule with no keywords at all', () => {
    expect(filterEmptyMatchingRules({ rules: [noteRule({ keywords: [] })] })).toEqual([]);
  });

  it('keeps an amount rule when either bound is positive', () => {
    expect(filterEmptyMatchingRules({ rules: [amountRule({ min: 0, max: 10 })] })).toHaveLength(1);
    expect(filterEmptyMatchingRules({ rules: [amountRule({ min: 5, max: 0 })] })).toHaveLength(1);
  });

  it('drops an amount rule with both bounds at zero', () => {
    expect(filterEmptyMatchingRules({ rules: [amountRule({ min: 0, max: 0 })] })).toEqual([]);
  });

  it('drops scalar rules holding the empty-string or zero placeholder', () => {
    expect(
      filterEmptyMatchingRules({ rules: [transactionTypeRule({ value: '' }), accountRule({ value: 0 })] }),
    ).toEqual([]);
  });

  it('keeps filled scalar rules', () => {
    const rules = [transactionTypeRule({ value: TRANSACTION_TYPES.expense }), accountRule({ value: ACCOUNT_ID })];
    expect(filterEmptyMatchingRules({ rules })).toEqual(rules);
  });

  it('preserves order and only removes the empty entries', () => {
    const filled = noteRule({ keywords: ['rent'] });
    const empty = amountRule({ min: 0, max: 0 });
    const alsoFilled = amountRule({ min: 1, max: 2 });
    expect(filterEmptyMatchingRules({ rules: [filled, empty, alsoFilled] })).toEqual([filled, alsoFilled]);
  });
});

describe('buildAutomationPayload', () => {
  const rules = [noteRule({ keywords: ['netflix'] }), amountRule({ min: 0, max: 0 })];

  it('sends filtered rules with autoRecord off in match mode', () => {
    expect(buildAutomationPayload({ mode: AUTOMATION_MODES.match, rules, accountId: ACCOUNT_ID })).toEqual({
      autoRecord: false,
      matchingRules: { rules: [noteRule({ keywords: ['netflix'] })] },
      accountId: ACCOUNT_ID,
    });
  });

  it('trims blank keywords out of the rules it sends in match mode', () => {
    const payload = buildAutomationPayload({
      mode: AUTOMATION_MODES.match,
      rules: [noteRule({ keywords: ['', '  spotify  '] })],
      accountId: ACCOUNT_ID,
    });
    expect(payload.matchingRules.rules).toEqual([noteRule({ keywords: ['spotify'] })]);
  });

  it('clears rules and turns autoRecord on in record mode', () => {
    expect(buildAutomationPayload({ mode: AUTOMATION_MODES.record, rules, accountId: ACCOUNT_ID })).toEqual({
      autoRecord: true,
      matchingRules: { rules: [] },
      accountId: ACCOUNT_ID,
    });
  });

  it('clears both mechanisms in manual mode', () => {
    expect(buildAutomationPayload({ mode: AUTOMATION_MODES.manual, rules, accountId: null })).toEqual({
      autoRecord: false,
      matchingRules: { rules: [] },
      accountId: null,
    });
  });

  it('always carries the account, normalising an empty selection to null', () => {
    expect(buildAutomationPayload({ mode: AUTOMATION_MODES.manual, rules: [], accountId: '' }).accountId).toBeNull();
  });
});
