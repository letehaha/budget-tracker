import type { FormattedCategory } from '@/common/types';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  type AccountModel,
  PAYMENT_TYPES,
  type RecordId,
  TRANSACTION_TYPES,
  type TransactionTemplateModel,
} from '@bt/shared/types';
import { describe, expect, it, vi } from 'vitest';
import { type EmitFn, type ShortEmitsToObject } from 'vue';
import type { ComposerTranslation } from 'vue-i18n';

import {
  EMPTY_FIELD_LABEL,
  type TemplateListEmits,
  type TemplateListProps,
  getTemplateHiddenFields,
  useTemplateList,
} from './use-template-list';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a1' as RecordId;
const CATEGORY_ID = '00000000-0000-0000-0000-0000000000c1' as RecordId;

// Echoes the key so a spec assertion reads as the key the UI renders.
const t = ((key: string, named?: Record<string, unknown>) =>
  named ? `${key}:${JSON.stringify(named)}` : key) as unknown as ComposerTranslation;

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

describe('getTemplateHiddenFields', () => {
  it('is empty when the template carries none of them', () => {
    expect(getTemplateHiddenFields({ template: createTemplate(), t })).toBe('');
  });

  it('names the payment type, the tag count and the note', () => {
    const template = createTemplate({
      paymentType: PAYMENT_TYPES.cash,
      tagIds: ['tag-a', 'tag-b'] as RecordId[],
      note: 'Latte',
    });

    expect(getTemplateHiddenFields({ template, t })).toBe(
      'common.paymentTypes.cash · dialogs.manageTransaction.templates.tagsCount:{"count":2} · dialogs.manageTransaction.form.noteLabel',
    );
  });
});

const createAccount = (overrides: Partial<AccountModel> = {}): AccountModel =>
  ({
    id: ACCOUNT_ID,
    name: 'Checking',
    type: ACCOUNT_TYPES.system,
    status: ACCOUNT_STATUSES.active,
    currencyCode: 'JPY',
    ...overrides,
  }) as AccountModel;

const createList = (overrides: Partial<TemplateListProps> = {}) => {
  const props: TemplateListProps = {
    templates: [],
    applied: null,
    disabled: false,
    canSaveCurrent: true,
    open: false,
    isError: false,
    isLoading: false,
    sources: {
      sourceAccounts: [createAccount()],
      categoriesMap: {} as Record<string, FormattedCategory>,
      knownTagIds: new Set<string>(),
    },
    ...overrides,
  };
  const emit = vi.fn() as unknown as EmitFn<ShortEmitsToObject<TemplateListEmits>>;
  return useTemplateList({ props, emit });
};

describe('amountLabelOf', () => {
  it('renders a dash when the template carries no amount', () => {
    const { amountLabelOf } = createList();

    expect(amountLabelOf({ template: createTemplate({ amount: null }) })).toBe(EMPTY_FIELD_LABEL);
  });

  it('renders the amount in the pinned account currency', () => {
    const { amountLabelOf } = createList();

    const label = amountLabelOf({ template: createTemplate({ amount: 1234.5 }) });

    expect(label).toContain('1,235');
    expect(label).not.toContain('$');
  });

  it('renders a dash when the pinned account no longer resolves', () => {
    const { amountLabelOf } = createList({
      sources: {
        sourceAccounts: [],
        categoriesMap: {} as Record<string, FormattedCategory>,
        knownTagIds: new Set<string>(),
      },
    });

    expect(amountLabelOf({ template: createTemplate({ amount: 1234.5 }) })).toBe(EMPTY_FIELD_LABEL);
  });
});

describe('filtered', () => {
  const templates = [createTemplate({ name: 'Morning coffee' }), createTemplate({ name: 'Rent' })];

  it('returns every template for a blank query', () => {
    const { filtered, query } = createList({ templates });

    query.value = '   ';

    expect(filtered.value).toHaveLength(2);
  });

  it('matches case-insensitively, ignoring surrounding whitespace', () => {
    const { filtered, query } = createList({ templates });

    query.value = '  COFFEE ';

    expect(filtered.value.map((template) => template.name)).toEqual(['Morning coffee']);
  });
});

describe('footerActions', () => {
  const disabledKeys = (actions: { key: string; disabled: boolean }[]) =>
    actions.filter((action) => action.disabled).map((action) => action.key);

  it('offers only the create actions while no template is applied', () => {
    const { footerActions } = createList();

    expect(footerActions.value.map((action) => action.key)).toEqual(['save-current', 'new']);
  });

  it('offers the applied-template actions once one is applied', () => {
    const { footerActions } = createList({ applied: createTemplate() });

    expect(footerActions.value.map((action) => action.key)).toEqual([
      'save-current',
      'update-current',
      'save-as-new',
      'new',
    ]);
  });

  it('disables both "save the current form" actions when the form carries nothing to save', () => {
    const { footerActions } = createList({ applied: createTemplate(), canSaveCurrent: false });

    expect(disabledKeys(footerActions.value)).toEqual(['save-current', 'save-as-new']);
  });
});
