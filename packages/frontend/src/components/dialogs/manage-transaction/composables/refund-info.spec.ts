import { TRANSACTION_TYPES, type TransactionModel } from '@bt/shared/types';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Ref, defineComponent, nextTick, ref } from 'vue';

import { FORM_TYPES, type UI_FORM_STRUCT } from '../types';
import { getRefundInfo } from './refund-info';

vi.mock('@/api/refunds', () => ({
  getRefundsForTransaction: vi.fn().mockResolvedValue([]),
}));

type RefundInfoResult = ReturnType<typeof getRefundInfo>;
type OriginalRefunds = RefundInfoResult['originalRefunds']['value'];

const makeTx = (id: string, transactionType: TRANSACTION_TYPES): TransactionModel =>
  ({ id, transactionType }) as unknown as TransactionModel;

const makeForm = (overrides: Partial<UI_FORM_STRUCT> = {}): UI_FORM_STRUCT =>
  ({
    type: FORM_TYPES.expense,
    refundsTx: undefined,
    refundedByTxs: undefined,
    ...overrides,
  }) as UI_FORM_STRUCT;

const setup = ({
  form,
  onRefundLinkCleared,
}: {
  form: Ref<UI_FORM_STRUCT>;
  onRefundLinkCleared?: () => void;
}): (() => RefundInfoResult) => {
  let result: RefundInfoResult | undefined;

  const TestComponent = defineComponent({
    setup() {
      result = getRefundInfo({ initialTransaction: undefined, form, onRefundLinkCleared });
      return {};
    },
    template: '<div />',
  });

  mount(TestComponent);

  return () => result!;
};

describe('getRefundInfo type-flip watcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears a refundsTx link when the form type flips to the same side as the linked original', async () => {
    // Expense form refunding an income original is valid; flipping to income makes
    // both sides income → the (now invalid) link must be dropped.
    const form = ref(
      makeForm({
        type: FORM_TYPES.expense,
        refundsTx: { transaction: makeTx('orig-1', TRANSACTION_TYPES.income) },
      }),
    );
    const onRefundLinkCleared = vi.fn();
    setup({ form, onRefundLinkCleared });

    form.value.type = FORM_TYPES.income;
    await nextTick();

    expect(form.value.refundsTx).toBeUndefined();
    expect(onRefundLinkCleared).toHaveBeenCalledTimes(1);
  });

  it('clears a refundedByTxs link when the form type flips to the same side as the refunding txs', async () => {
    const form = ref(
      makeForm({
        type: FORM_TYPES.expense,
        refundedByTxs: [{ transaction: makeTx('refund-1', TRANSACTION_TYPES.income) }],
      }),
    );
    const onRefundLinkCleared = vi.fn();
    setup({ form, onRefundLinkCleared });

    form.value.type = FORM_TYPES.income;
    await nextTick();

    expect(form.value.refundedByTxs).toBeUndefined();
    expect(onRefundLinkCleared).toHaveBeenCalledTimes(1);
  });

  it('clears to null (not undefined) when the row already had refunds so the edit path clears them server-side', async () => {
    const form = ref(
      makeForm({
        type: FORM_TYPES.expense,
        refundsTx: { transaction: makeTx('orig-1', TRANSACTION_TYPES.income) },
      }),
    );
    const getResult = setup({ form });
    // Simulate an existing transaction that was opened with a saved refund link.
    getResult().originalRefunds.value = [{} as OriginalRefunds[number]];

    form.value.type = FORM_TYPES.income;
    await nextTick();

    expect(form.value.refundsTx).toBeNull();
  });

  it('keeps the link when a type flip leaves the counterpart on the opposite side', async () => {
    // Income form with an income-type refundsTx is invalid, but the watcher only
    // reacts to changes: flipping to expense makes income the correct opposite, so
    // the link stays.
    const form = ref(
      makeForm({
        type: FORM_TYPES.income,
        refundsTx: { transaction: makeTx('orig-1', TRANSACTION_TYPES.income) },
      }),
    );
    const onRefundLinkCleared = vi.fn();
    setup({ form, onRefundLinkCleared });

    form.value.type = FORM_TYPES.expense;
    await nextTick();

    expect(form.value.refundsTx).toEqual({ transaction: expect.objectContaining({ id: 'orig-1' }) });
    expect(onRefundLinkCleared).not.toHaveBeenCalled();
  });
});
