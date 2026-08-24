import { VERBOSE_PAYMENT_TYPES } from '@/common/const';
import type { FormattedCategory } from '@/common/types';
import {
  ACCOUNT_TYPES,
  type AccountModel,
  PAYMENT_TYPES,
  type RecordId,
  TRANSACTION_TYPES,
  type TransactionModel,
  type TransactionTemplateModel,
} from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

import { FORM_TYPES, type UI_FORM_STRUCT } from '../types';
import type { TemplateFormSources } from '../utils/template-to-form';
import type { TransferDestinationType } from './transfer-form';
import { type AppliedTemplateSession, useAppliedTemplate } from './use-applied-template';

const ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a1' as RecordId;
const OTHER_ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a2' as RecordId;
const CATEGORY_ID = '00000000-0000-0000-0000-0000000000c1' as RecordId;
const MISSING_CATEGORY_ID = '00000000-0000-0000-0000-0000000000c9' as RecordId;

const createAccount = (overrides: Partial<AccountModel> = {}): AccountModel =>
  ({
    id: ACCOUNT_ID,
    name: 'Checking',
    type: ACCOUNT_TYPES.system,
    currencyCode: 'USD',
    ...overrides,
  }) as AccountModel;

const createCategory = (overrides: Partial<FormattedCategory> = {}): FormattedCategory =>
  ({
    id: CATEGORY_ID,
    name: 'Groceries',
    subCategories: [],
    ...overrides,
  }) as FormattedCategory;

const createTemplate = (overrides: Partial<TransactionTemplateModel> = {}): TransactionTemplateModel =>
  ({
    id: '00000000-0000-0000-0000-0000000000t1' as RecordId,
    userId: 1,
    name: 'Morning coffee',
    transactionType: TRANSACTION_TYPES.expense,
    amount: 4.5,
    accountId: ACCOUNT_ID,
    categoryId: CATEGORY_ID,
    payeeId: null,
    paymentType: PAYMENT_TYPES.cash,
    note: 'Latte',
    tagIds: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }) as TransactionTemplateModel;

const createPreTemplateForm = (): UI_FORM_STRUCT => ({
  amount: 999,
  account: createAccount({ id: OTHER_ACCOUNT_ID, name: 'Savings' }),
  toAccount: createAccount({ id: OTHER_ACCOUNT_ID }),
  toPortfolio: null,
  targetAmount: 120,
  category: createCategory(),
  time: new Date('2020-06-01T10:00:00Z'),
  paymentType: VERBOSE_PAYMENT_TYPES.find((item) => item.value === PAYMENT_TYPES.creditCard) ?? null,
  note: 'typed by hand',
  type: FORM_TYPES.transfer,
  refundedByTxs: undefined,
  refundsTx: undefined,
  splits: [{ category: createCategory(), amount: 10 }],
  tagIds: ['tag-a'],
  payeeId: null,
  categoryUserTouched: true,
  isPlanned: true,
  originalAmount: null,
  originalCurrency: null,
});

const linkedTransactionFixture = { id: '00000000-0000-0000-0000-0000000000f1' as RecordId } as TransactionModel;

const createSession = (): AppliedTemplateSession => ({
  form: ref<UI_FORM_STRUCT>(createPreTemplateForm()),
  transferDestinationType: ref<TransferDestinationType>('portfolio'),
  linkedTransaction: ref<TransactionModel | null>(linkedTransactionFixture),
});

const sources: TemplateFormSources = {
  sourceAccounts: [createAccount(), createAccount({ id: OTHER_ACCOUNT_ID, name: 'Savings' })],
  categoriesMap: { [CATEGORY_ID]: createCategory() },
  knownTagIds: new Set<string>(),
};

describe('useAppliedTemplate', () => {
  it('writes the template into the form and resets the transfer destination and link', () => {
    const session = createSession();
    const template = createTemplate();
    const { applied, apply } = useAppliedTemplate({ session });

    apply({ template, sources });

    expect(applied.value?.id).toBe(template.id);
    expect(session.form.value.type).toBe(FORM_TYPES.expense);
    expect(session.form.value.account?.id).toBe(ACCOUNT_ID);
    expect(session.form.value.amount).toBe(4.5);
    expect(session.transferDestinationType.value).toBe('account');
    expect(session.linkedTransaction.value).toBeNull();
  });

  it('leaves the last applied values in place after a second apply', () => {
    const session = createSession();
    const { apply } = useAppliedTemplate({ session });

    apply({ template: createTemplate(), sources });
    apply({ template: createTemplate({ amount: 12, note: 'Second' }), sources });

    expect(session.form.value.amount).toBe(12);
    expect(session.form.value.note).toBe('Second');
  });

  it('adopts a form-built template without rewriting the form or reporting missing refs', () => {
    const session = createSession();
    const before = { ...session.form.value };
    const template = createTemplate({ categoryId: MISSING_CATEGORY_ID });
    const { applied, missing, adopt } = useAppliedTemplate({ session });

    adopt({ template, mode: 'from-form', sources });

    expect(applied.value?.id).toBe(template.id);
    expect(missing.value).toEqual([]);
    expect(session.form.value).toEqual(before);
    expect(session.transferDestinationType.value).toBe('portfolio');
  });

  it('recomputes the missing refs when an edited template is adopted', () => {
    const session = createSession();
    const { missing, apply, adopt } = useAppliedTemplate({ session });

    apply({ template: createTemplate(), sources });
    expect(missing.value).toEqual([]);

    adopt({ template: createTemplate({ categoryId: MISSING_CATEGORY_ID }), mode: 'edit', sources });

    expect(missing.value).toEqual(['category']);
  });

  it('drops the pill on dismiss and keeps the applied form values', () => {
    const session = createSession();
    const { applied, missing, apply, dismiss } = useAppliedTemplate({ session });

    apply({ template: createTemplate({ categoryId: MISSING_CATEGORY_ID }), sources });
    dismiss();

    expect(applied.value).toBeNull();
    expect(missing.value).toEqual([]);
    expect(session.form.value.amount).toBe(4.5);
    expect(session.form.value.note).toBe('Latte');
    expect(session.form.value.type).toBe(FORM_TYPES.expense);
  });

  it('exposes the references the template could not resolve', () => {
    const session = createSession();
    const { missing, apply } = useAppliedTemplate({ session });

    apply({ template: createTemplate({ categoryId: MISSING_CATEGORY_ID }), sources });

    expect(missing.value).toEqual(['category']);
  });
});
