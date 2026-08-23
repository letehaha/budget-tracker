import type { FormattedCategory } from '@/common/types';
import {
  ACCOUNT_TYPES,
  type AccountModel,
  type RecordId,
  TRANSACTION_TYPES,
  type TransactionTemplateModel,
} from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import type { TemplateFormSources } from '../../utils/template-to-form';
import { getTemplateStaleReason } from './template-staleness';

const ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a1' as RecordId;
const CATEGORY_ID = '00000000-0000-0000-0000-0000000000c1' as RecordId;

const sources: TemplateFormSources = {
  sourceAccounts: [{ id: ACCOUNT_ID, name: 'Checking', type: ACCOUNT_TYPES.system } as AccountModel],
  categoriesMap: { [CATEGORY_ID]: { id: CATEGORY_ID, name: 'Groceries' } as FormattedCategory },
  knownTagIds: new Set<string>(),
};

const createTemplate = (overrides: Partial<TransactionTemplateModel> = {}): TransactionTemplateModel =>
  ({
    id: '00000000-0000-0000-0000-0000000000t1' as RecordId,
    name: 'Morning coffee',
    transactionType: TRANSACTION_TYPES.expense,
    amount: 4.5,
    accountId: ACCOUNT_ID,
    categoryId: CATEGORY_ID,
    payeeId: null,
    paymentType: null,
    note: null,
    tagIds: [],
    ...overrides,
  }) as TransactionTemplateModel;

describe('getTemplateStaleReason', () => {
  it('returns null when both references resolve', () => {
    expect(getTemplateStaleReason({ template: createTemplate(), sources })).toBeNull();
  });

  it('treats a template saved without a category as healthy', () => {
    expect(getTemplateStaleReason({ template: createTemplate({ categoryId: null }), sources })).toBeNull();
  });

  it('flags a category the user has since deleted', () => {
    const template = createTemplate({ categoryId: '00000000-0000-0000-0000-0000000000c9' as RecordId });
    expect(getTemplateStaleReason({ template, sources })).toBe('categoryDeleted');
  });

  it('flags an account the picker no longer offers', () => {
    const template = createTemplate({ accountId: '00000000-0000-0000-0000-0000000000a9' as RecordId });
    expect(getTemplateStaleReason({ template, sources })).toBe('accountUnavailable');
  });

  it('treats a template with no pinned account as healthy', () => {
    expect(getTemplateStaleReason({ template: createTemplate({ accountId: null }), sources })).toBeNull();
  });
});
