import { AUTOMATION_LIMITS, type AutomationCondition, type RecordId, TRANSACTION_TYPES } from '@bt/shared/types';

import { actionError, conditionError, migrateAmountBounds, nameError } from './automation-validation';
import type { AutomationActionDraft } from './condition-registry';

const id = (value: string) => value as RecordId;

const check = (items: AutomationCondition[], index = 0) => conditionError({ items, index });

const amount = (
  operator: 'gte' | 'lte' | 'between' | 'equals',
  value: { min?: number; max?: number },
): AutomationCondition => ({ field: 'amount', operator, value, currency: { mode: 'transaction' } });

const transactionType = (): AutomationCondition => ({
  field: 'transactionType',
  operator: 'equals',
  value: TRANSACTION_TYPES.expense,
});

describe('nameError', () => {
  test('requires a non-blank name', () => {
    expect(nameError({ name: '   ' })).toEqual({ key: 'automations.editor.errors.nameRequired', params: undefined });
  });

  test('caps the length', () => {
    expect(nameError({ name: 'a'.repeat(AUTOMATION_LIMITS.maxNameLength + 1) })).toEqual({
      key: 'automations.editor.errors.nameTooLong',
      params: { max: AUTOMATION_LIMITS.maxNameLength },
    });
  });

  test('accepts a valid name', () => {
    expect(nameError({ name: 'Groceries' })).toBeNull();
  });
});

describe('conditionError – text fields', () => {
  test('is_empty needs no keywords', () => {
    expect(check([{ field: 'note', operator: 'is_empty', value: [] }])).toBeNull();
  });

  test('blank keywords are rejected', () => {
    expect(check([{ field: 'merchant', operator: 'contains_any', value: ['  ', ''] }])).toEqual({
      key: 'automations.editor.errors.keywordsRequired',
      params: undefined,
    });
  });

  test('too many keywords are rejected', () => {
    const value = Array.from({ length: AUTOMATION_LIMITS.maxKeywords + 1 }, (_, index) => `keyword-${index}`);
    expect(check([{ field: 'note', operator: 'contains_any', value }])).toEqual({
      key: 'automations.editor.errors.keywordsMax',
      params: { max: AUTOMATION_LIMITS.maxKeywords },
    });
  });

  test('an over-long keyword is rejected', () => {
    const value = ['a'.repeat(AUTOMATION_LIMITS.maxKeywordLength + 1)];
    expect(check([{ field: 'note', operator: 'contains_any', value }])).toEqual({
      key: 'automations.editor.errors.keywordTooLong',
      params: { max: AUTOMATION_LIMITS.maxKeywordLength },
    });
  });

  test('a valid keyword list passes', () => {
    expect(check([{ field: 'note', operator: 'contains_any', value: ['uber'] }])).toBeNull();
  });
});

describe('conditionError – list fields', () => {
  test('an empty selection is rejected', () => {
    expect(check([{ field: 'payee', operator: 'in', value: [] }])).toEqual({
      key: 'automations.editor.errors.selectionRequired',
      params: undefined,
    });
  });

  test('too many ids are rejected', () => {
    const value = Array.from({ length: AUTOMATION_LIMITS.maxIds + 1 }, (_, index) => id(`a${index}`));
    expect(check([{ field: 'accountGroup', operator: 'in', value }])).toEqual({
      key: 'automations.editor.errors.selectionMax',
      params: { max: AUTOMATION_LIMITS.maxIds },
    });
  });

  test('a deleted reference is reported', () => {
    const items: AutomationCondition[] = [{ field: 'bankConnection', operator: 'in', value: [id('c1')] }];
    expect(conditionError({ items, index: 0, hasMissingRef: () => true })).toEqual({
      key: 'automations.editor.errors.missingRef',
      params: undefined,
    });
  });

  test('a resolvable selection passes', () => {
    expect(check([{ field: 'account', operator: 'in', value: [id('a1')] }])).toBeNull();
  });
});

describe('conditionError – amount and day', () => {
  test('between requires both bounds', () => {
    expect(check([amount('between', { min: 10 })])).toEqual({
      key: 'automations.editor.errors.amountBoundsRequired',
      params: undefined,
    });
  });

  test('between rejects an inverted range', () => {
    expect(check([amount('between', { min: 20, max: 10 })])).toEqual({
      key: 'automations.editor.errors.amountRange',
      params: undefined,
    });
  });

  test('lte reads the max bound', () => {
    expect(check([amount('lte', { min: 10 })])).toEqual({
      key: 'automations.editor.errors.amountRequired',
      params: undefined,
    });
    expect(check([amount('lte', { max: 10 })])).toBeNull();
  });

  test('gte reads the min bound', () => {
    expect(check([amount('gte', {})])).toEqual({
      key: 'automations.editor.errors.amountRequired',
      params: undefined,
    });
    expect(check([amount('gte', { min: 0 })])).toBeNull();
  });

  test('day of month must stay inside 1-31 and ordered', () => {
    expect(check([{ field: 'dayOfMonth', operator: 'between', value: { min: 0, max: 5 } }])).toEqual({
      key: 'automations.editor.errors.dayRange',
      params: undefined,
    });
    expect(check([{ field: 'dayOfMonth', operator: 'between', value: { min: 5, max: 3 } }])).toEqual({
      key: 'automations.editor.errors.dayRange',
      params: undefined,
    });
    expect(check([{ field: 'dayOfMonth', operator: 'between', value: { min: 1, max: 31 } }])).toBeNull();
  });

  test('day of month rejects fractions', () => {
    expect(check([{ field: 'dayOfMonth', operator: 'between', value: { min: 1.5, max: 5 } }])).toEqual({
      key: 'automations.editor.errors.dayRange',
      params: undefined,
    });
  });
});

describe('conditionError – transaction type', () => {
  test('the first transaction type condition passes', () => {
    expect(check([transactionType()])).toBeNull();
  });

  test('a second transaction type condition is rejected', () => {
    const items = [transactionType(), transactionType()];
    expect(check(items, 0)).toBeNull();
    expect(check(items, 1)).toEqual({
      key: 'automations.editor.errors.transactionTypeDuplicate',
      params: undefined,
    });
  });
});

describe('actionError', () => {
  const action = (value: AutomationActionDraft) => actionError({ action: value });

  test('set_category requires a category', () => {
    expect(action({ type: 'set_category', categoryId: null })).toEqual({
      key: 'automations.editor.errors.categoryRequired',
      params: undefined,
    });
    expect(action({ type: 'set_category', categoryId: id('c1') })).toBeNull();
  });

  test('set_payee requires a payee', () => {
    expect(action({ type: 'set_payee', payeeId: null })).toEqual({
      key: 'automations.editor.errors.payeeRequired',
      params: undefined,
    });
  });

  test('add_tags requires at least one tag and caps the count', () => {
    expect(action({ type: 'add_tags', tagIds: [] })).toEqual({
      key: 'automations.editor.errors.tagsRequired',
      params: undefined,
    });
    const tagIds = Array.from({ length: AUTOMATION_LIMITS.maxIds + 1 }, (_, index) => id(`t${index}`));
    expect(action({ type: 'add_tags', tagIds })).toEqual({
      key: 'automations.editor.errors.selectionMax',
      params: { max: AUTOMATION_LIMITS.maxIds },
    });
  });

  test('add_tags reports a deleted tag', () => {
    expect(actionError({ action: { type: 'add_tags', tagIds: [id('t1')] }, hasMissingRef: () => true })).toEqual({
      key: 'automations.editor.errors.missingRef',
      params: undefined,
    });
  });

  test('set_note requires a value and caps its length', () => {
    expect(action({ type: 'set_note', mode: 'replace', value: '  ' })).toEqual({
      key: 'automations.editor.errors.noteRequired',
      params: undefined,
    });
    expect(
      action({ type: 'set_note', mode: 'append', value: 'a'.repeat(AUTOMATION_LIMITS.maxNoteLength + 1) }),
    ).toEqual({
      key: 'automations.editor.errors.noteTooLong',
      params: { max: AUTOMATION_LIMITS.maxNoteLength },
    });
    expect(action({ type: 'set_note', mode: 'prepend', value: 'paid' })).toBeNull();
  });
});

describe('migrateAmountBounds', () => {
  const condition = (value: { min?: number; max?: number }) =>
    amount('gte', value) as Extract<AutomationCondition, { field: 'amount' }>;

  test('between spreads the single bound across both slots', () => {
    expect(migrateAmountBounds({ condition: condition({ min: 25 }), operator: 'between' })).toEqual({
      min: 25,
      max: 25,
    });
  });

  test('lte moves the bound into max', () => {
    expect(migrateAmountBounds({ condition: condition({ min: 25 }), operator: 'lte' })).toEqual({ max: 25 });
  });

  test('gte and equals move the bound into min', () => {
    expect(migrateAmountBounds({ condition: condition({ max: 25 }), operator: 'gte' })).toEqual({ min: 25 });
    expect(migrateAmountBounds({ condition: condition({ max: 25 }), operator: 'equals' })).toEqual({ min: 25 });
  });

  test('an empty bound stays empty', () => {
    expect(migrateAmountBounds({ condition: condition({}), operator: 'between' })).toEqual({
      min: undefined,
      max: undefined,
    });
  });

  test('leaving between keeps the bound the new operator reads', () => {
    expect(migrateAmountBounds({ condition: condition({ min: 10, max: 20 }), operator: 'lte' })).toEqual({ max: 20 });
    expect(migrateAmountBounds({ condition: condition({ min: 10, max: 20 }), operator: 'gte' })).toEqual({ min: 10 });
  });
});
