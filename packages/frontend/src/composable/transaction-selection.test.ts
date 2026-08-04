import { TransactionModel, TransactionSplitModel, type RecordId } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import { type Ref, nextTick, ref } from 'vue';

import { getVanishedSelectedIds, useTransactionSelection } from './transaction-selection';

const buildTx = (overrides: Partial<TransactionModel>): TransactionModel =>
  ({
    id: '00000000-0000-0000-0000-000000000001' as RecordId,
    accountId: '00000000-0000-0000-0000-000000000100' as RecordId,
    splits: undefined,
    ...overrides,
  }) as TransactionModel;

describe('useTransactionSelection', () => {
  it('default selectability — split parents are not selectable', () => {
    const splitParent = buildTx({
      id: '00000000-0000-0000-0000-000000000001' as RecordId,
      splits: [
        {
          id: '00000000-0000-0000-0000-000000000011' as RecordId,
          transactionId: '00000000-0000-0000-0000-000000000001',
          userId: 100,
          categoryId: '00000000-0000-0000-0000-000000000001',
          amount: 100,
          refAmount: 100,
          note: null,
        } as TransactionSplitModel,
      ],
    });
    const regular = buildTx({ id: '00000000-0000-0000-0000-000000000002' as RecordId });
    const { isTransactionSelectable } = useTransactionSelection({
      getTransactions: () => [splitParent, regular],
    });

    expect(isTransactionSelectable(splitParent)).toBe(false);
    expect(isTransactionSelectable(regular)).toBe(true);
  });

  it('honors isExtraSelectable for callers that need an extra gate (e.g. shared-account lockout)', () => {
    const ownAccountTx = buildTx({
      id: '00000000-0000-0000-0000-000000000001' as RecordId,
      accountId: '00000000-0000-0000-0000-000000000100' as RecordId,
    });
    const sharedAccountTx = buildTx({
      id: '00000000-0000-0000-0000-000000000002' as RecordId,
      accountId: '00000000-0000-0000-0000-000000000200' as RecordId,
    });

    const { isTransactionSelectable } = useTransactionSelection({
      getTransactions: () => [ownAccountTx, sharedAccountTx],
      isExtraSelectable: (tx) => tx.accountId !== '00000000-0000-0000-0000-000000000200',
    });

    expect(isTransactionSelectable(ownAccountTx)).toBe(true);
    expect(isTransactionSelectable(sharedAccountTx)).toBe(false);
  });

  it('selectAll skips transactions blocked by isExtraSelectable', () => {
    const a = buildTx({
      id: '00000000-0000-0000-0000-000000000001' as RecordId,
      accountId: '00000000-0000-0000-0000-000000000100' as RecordId,
    });
    const b = buildTx({
      id: '00000000-0000-0000-0000-000000000002' as RecordId,
      accountId: '00000000-0000-0000-0000-000000000200' as RecordId,
    });
    const c = buildTx({
      id: '00000000-0000-0000-0000-000000000003' as RecordId,
      accountId: '00000000-0000-0000-0000-000000000100' as RecordId,
    });

    const { selectAll, selectedCount, isTransactionSelected } = useTransactionSelection({
      getTransactions: () => [a, b, c],
      isExtraSelectable: (tx) => tx.accountId === '00000000-0000-0000-0000-000000000100',
    });

    selectAll();

    expect(selectedCount.value).toBe(2);
    expect(isTransactionSelected('00000000-0000-0000-0000-000000000001')).toBe(true);
    expect(isTransactionSelected('00000000-0000-0000-0000-000000000002')).toBe(false);
    expect(isTransactionSelected('00000000-0000-0000-0000-000000000003')).toBe(true);
  });

  it('isAllSelected reflects the gated set, not the raw transaction list', () => {
    const a = buildTx({
      id: '00000000-0000-0000-0000-000000000001' as RecordId,
      accountId: '00000000-0000-0000-0000-000000000100' as RecordId,
    });
    const b = buildTx({
      id: '00000000-0000-0000-0000-000000000002' as RecordId,
      accountId: '00000000-0000-0000-0000-000000000200' as RecordId,
    });

    const { selectAll, isAllSelected } = useTransactionSelection({
      getTransactions: () => [a, b],
      isExtraSelectable: (tx) => tx.accountId === '00000000-0000-0000-0000-000000000100',
    });

    selectAll();
    expect(isAllSelected.value).toBe(true);
  });
});

describe('getVanishedSelectedIds', () => {
  it('reports the selected ids missing from the loaded rows', () => {
    expect(getVanishedSelectedIds({ selectedIds: ['a', 'b', 'c'], loadedIds: ['a', 'c'] })).toEqual(['b']);
  });

  it('reports nothing when the loaded list is empty', () => {
    expect(getVanishedSelectedIds({ selectedIds: ['a', 'b'], loadedIds: [] })).toEqual([]);
  });
});

const a = buildTx({ id: '00000000-0000-0000-0000-000000000001' as RecordId });
const b = buildTx({ id: '00000000-0000-0000-0000-000000000002' as RecordId });
const c = buildTx({ id: '00000000-0000-0000-0000-000000000003' as RecordId });

describe('useTransactionSelection — pruning against loaded rows', () => {
  it('drops selections whose rows vanished from the refetched list', async () => {
    const transactions = ref<TransactionModel[]>([a, b, c]);
    const { selectAll, selectedCount, isTransactionSelected } = useTransactionSelection({
      getTransactions: () => transactions.value,
    });

    selectAll();
    expect(selectedCount.value).toBe(3);

    transactions.value = [a, c];
    await nextTick();

    expect(selectedCount.value).toBe(2);
    expect(isTransactionSelected(b.id)).toBe(false);
    expect(isTransactionSelected(a.id)).toBe(true);
    expect(isTransactionSelected(c.id)).toBe(true);
  });

  it('keeps the selection while the list is transiently empty', async () => {
    const transactions = ref<TransactionModel[]>([a, b]);
    const { selectAll, selectedCount } = useTransactionSelection({
      getTransactions: () => transactions.value,
    });

    selectAll();

    transactions.value = [];
    await nextTick();

    expect(selectedCount.value).toBe(2);

    transactions.value = [a, b];
    await nextTick();

    expect(selectedCount.value).toBe(2);
  });

  it('keeps the selection when the next page is appended', async () => {
    const transactions = ref<TransactionModel[]>([a, b]);
    const { selectAll, selectedCount, isTransactionSelected } = useTransactionSelection({
      getTransactions: () => transactions.value,
    });

    selectAll();

    transactions.value = [a, b, c];
    await nextTick();

    expect(selectedCount.value).toBe(2);
    expect(isTransactionSelected(a.id)).toBe(true);
    expect(isTransactionSelected(b.id)).toBe(true);
    expect(isTransactionSelected(c.id)).toBe(false);
  });
});

describe('useTransactionSelection — scoped selection', () => {
  const buildScoped = ({ transactions, scopeKey }: { transactions: Ref<TransactionModel[]>; scopeKey: Ref<string> }) =>
    useTransactionSelection({
      getTransactions: () => transactions.value,
      getScopeKey: () => scopeKey.value,
    });

  it('clears the whole selection when the scope changes', async () => {
    const transactions = ref<TransactionModel[]>([a, b, c]);
    const scopeKey = ref('time:desc');
    const { selectAll, selectedCount } = buildScoped({ transactions, scopeKey });

    selectAll();
    expect(selectedCount.value).toBe(3);

    scopeKey.value = 'amount:asc';
    transactions.value = [a];
    await nextTick();

    expect(selectedCount.value).toBe(0);
  });

  it('prunes only genuinely vanished rows while the scope is stable', async () => {
    const transactions = ref<TransactionModel[]>([a, b, c]);
    const scopeKey = ref('time:desc');
    const { selectAll, selectedCount, isTransactionSelected } = buildScoped({ transactions, scopeKey });

    selectAll();

    transactions.value = [a, c];
    await nextTick();

    expect(selectedCount.value).toBe(2);
    expect(isTransactionSelected(b.id)).toBe(false);
  });

  it('keeps selections when the next page is appended within the same scope', async () => {
    const transactions = ref<TransactionModel[]>([a, b]);
    const scopeKey = ref('time:desc');
    const { selectAll, selectedCount } = buildScoped({ transactions, scopeKey });

    selectAll();

    transactions.value = [a, b, c];
    await nextTick();

    expect(selectedCount.value).toBe(2);
  });

  it('keeps the selection while the list is transiently empty within the same scope', async () => {
    const transactions = ref<TransactionModel[]>([a, b]);
    const scopeKey = ref('time:desc');
    const { selectAll, selectedCount } = buildScoped({ transactions, scopeKey });

    selectAll();

    transactions.value = [];
    await nextTick();

    expect(selectedCount.value).toBe(2);
  });
});
