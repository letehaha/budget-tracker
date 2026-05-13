import { TransactionModel, TransactionSplitModel } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { useTransactionSelection } from './transaction-selection';

const buildTx = (overrides: Partial<TransactionModel>): TransactionModel =>
  ({
    id: 1,
    accountId: 100,
    splits: undefined,
    ...overrides,
  }) as TransactionModel;

describe('useTransactionSelection', () => {
  it('default selectability — split parents are not selectable', () => {
    const splitParent = buildTx({
      id: 1,
      splits: [
        {
          id: '11',
          transactionId: 1,
          userId: 100,
          categoryId: 1,
          amount: 100,
          refAmount: 100,
          note: null,
        } as TransactionSplitModel,
      ],
    });
    const regular = buildTx({ id: 2 });
    const { isTransactionSelectable } = useTransactionSelection({
      getTransactions: () => [splitParent, regular],
    });

    expect(isTransactionSelectable(splitParent)).toBe(false);
    expect(isTransactionSelectable(regular)).toBe(true);
  });

  it('honors isExtraSelectable for callers that need an extra gate (e.g. shared-account lockout)', () => {
    const ownAccountTx = buildTx({ id: 1, accountId: 100 });
    const sharedAccountTx = buildTx({ id: 2, accountId: 200 });

    const { isTransactionSelectable } = useTransactionSelection({
      getTransactions: () => [ownAccountTx, sharedAccountTx],
      isExtraSelectable: (tx) => tx.accountId !== 200,
    });

    expect(isTransactionSelectable(ownAccountTx)).toBe(true);
    expect(isTransactionSelectable(sharedAccountTx)).toBe(false);
  });

  it('selectAll skips transactions blocked by isExtraSelectable', () => {
    const a = buildTx({ id: 1, accountId: 100 });
    const b = buildTx({ id: 2, accountId: 200 });
    const c = buildTx({ id: 3, accountId: 100 });

    const { selectAll, selectedCount, isTransactionSelected } = useTransactionSelection({
      getTransactions: () => [a, b, c],
      isExtraSelectable: (tx) => tx.accountId === 100,
    });

    selectAll();

    expect(selectedCount.value).toBe(2);
    expect(isTransactionSelected(1)).toBe(true);
    expect(isTransactionSelected(2)).toBe(false);
    expect(isTransactionSelected(3)).toBe(true);
  });

  it('isAllSelected reflects the gated set, not the raw transaction list', () => {
    const a = buildTx({ id: 1, accountId: 100 });
    const b = buildTx({ id: 2, accountId: 200 });

    const { selectAll, isAllSelected } = useTransactionSelection({
      getTransactions: () => [a, b],
      isExtraSelectable: (tx) => tx.accountId === 100,
    });

    selectAll();
    expect(isAllSelected.value).toBe(true);
  });
});
