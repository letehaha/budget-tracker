import { OUT_OF_WALLET_ACCOUNT_MOCK } from '@/common/const';
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
import { describe, expect, it } from 'vitest';

import { FORM_TYPES, type UI_FORM_STRUCT } from '../types';
import { formToTemplate } from './form-to-template';

const ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a1' as RecordId;
const CATEGORY_ID = '00000000-0000-0000-0000-0000000000c1' as RecordId;
const PAYEE_ID = '00000000-0000-0000-0000-0000000000p1' as RecordId;

const createAccount = (overrides: Partial<AccountModel> = {}): AccountModel =>
  ({
    id: ACCOUNT_ID,
    name: 'Checking',
    type: ACCOUNT_TYPES.system,
    status: ACCOUNT_STATUSES.active,
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

const createForm = (overrides: Partial<UI_FORM_STRUCT> = {}): UI_FORM_STRUCT => ({
  amount: 4.5,
  account: createAccount(),
  toAccount: null,
  toPortfolio: null,
  targetAmount: null,
  category: createCategory(),
  time: new Date('2024-01-15T12:00:00Z'),
  paymentType: { value: PAYMENT_TYPES.cash, label: 'common.paymentTypes.cash' },
  note: 'Latte',
  type: FORM_TYPES.expense,
  refundedByTxs: undefined,
  refundsTx: undefined,
  tagIds: ['tag-a'],
  payeeId: PAYEE_ID,
  categoryUserTouched: true,
  isPlanned: false,
  originalAmount: null,
  originalCurrency: null,
  ...overrides,
});

const createBase = (overrides: Partial<TransactionTemplateModel> = {}): TransactionTemplateModel =>
  ({
    id: '00000000-0000-0000-0000-0000000000t1' as RecordId,
    userId: 1,
    name: 'Morning coffee',
    transactionType: TRANSACTION_TYPES.expense,
    amount: 4.5,
    accountId: ACCOUNT_ID,
    categoryId: CATEGORY_ID,
    payeeId: PAYEE_ID,
    paymentType: PAYMENT_TYPES.cash,
    note: 'Latte',
    tagIds: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }) as TransactionTemplateModel;

describe('formToTemplate', () => {
  it('maps a fully filled expense form', () => {
    expect(formToTemplate({ form: createForm() })).toEqual({
      transactionType: TRANSACTION_TYPES.expense,
      accountId: ACCOUNT_ID,
      amount: 4.5,
      categoryId: CATEGORY_ID,
      payeeId: PAYEE_ID,
      tagIds: ['tag-a'],
      paymentType: PAYMENT_TYPES.cash,
      note: 'Latte',
    });
  });

  it('maps an income form to the income transaction type', () => {
    const result = formToTemplate({ form: createForm({ type: FORM_TYPES.income }) });

    expect(result.transactionType).toBe(TRANSACTION_TYPES.income);
  });

  it('excludes the seeded category the user never picked', () => {
    const result = formToTemplate({ form: createForm({ categoryUserTouched: false }) });

    expect(result.categoryId).toBeNull();
  });

  it('drops the out-of-wallet placeholder and its amount', () => {
    const result = formToTemplate({ form: createForm({ account: OUT_OF_WALLET_ACCOUNT_MOCK }) });

    expect(result.accountId).toBeNull();
    expect(result.amount).toBeNull();
  });

  it('drops a bank-linked account and its amount', () => {
    const result = formToTemplate({ form: createForm({ account: createAccount({ type: ACCOUNT_TYPES.monobank }) }) });

    expect(result.accountId).toBeNull();
    expect(result.amount).toBeNull();
  });

  it('drops an archived account and its amount', () => {
    const result = formToTemplate({
      form: createForm({ account: createAccount({ status: ACCOUNT_STATUSES.archived }) }),
    });

    expect(result.accountId).toBeNull();
    expect(result.amount).toBeNull();
  });

  it('drops an account shared with the caller: the backend only accepts an owned one', () => {
    const shared = createAccount({ share: { isOwner: false } as AccountModel['share'] });

    const result = formToTemplate({ form: createForm({ account: shared }) });

    expect(result.accountId).toBeNull();
    expect(result.amount).toBeNull();
  });

  it('keeps the "use whichever account is selected" flag from the base template', () => {
    const result = formToTemplate({ form: createForm(), base: createBase({ accountId: null, amount: null }) });

    expect(result.accountId).toBeNull();
    expect(result.amount).toBeNull();
  });

  it('keeps the "do not save an amount" flag from the base template', () => {
    const result = formToTemplate({ form: createForm(), base: createBase({ amount: null }) });

    expect(result.accountId).toBe(ACCOUNT_ID);
    expect(result.amount).toBeNull();
  });

  it('trims the note and nulls a whitespace-only one', () => {
    expect(formToTemplate({ form: createForm({ note: '  Latte  ' }) }).note).toBe('Latte');
    expect(formToTemplate({ form: createForm({ note: '   ' }) }).note).toBeNull();
    expect(formToTemplate({ form: createForm({ note: undefined }) }).note).toBeNull();
  });

  it('falls back to empty collections and nulls for an untouched form', () => {
    const result = formToTemplate({
      form: createForm({ amount: null, tagIds: undefined, payeeId: undefined, paymentType: null }),
    });

    expect(result).toMatchObject({ amount: null, tagIds: [], payeeId: null, paymentType: null });
  });

  it('throws for a transfer form', () => {
    expect(() => formToTemplate({ form: createForm({ type: FORM_TYPES.transfer }) })).toThrow();
  });
});
