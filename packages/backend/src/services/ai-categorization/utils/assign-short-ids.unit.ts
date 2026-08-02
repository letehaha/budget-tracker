import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';

import { CategoryForCategorization, TransactionForCategorization } from '../types';
import { assignShortIds } from './assign-short-ids';

function makeTransaction({ id }: { id: string }): TransactionForCategorization {
  return {
    id,
    amount: Money.fromDecimal(10),
    currencyCode: 'USD',
    accountName: 'Main',
    datetime: '2024-01-15T10:00:00Z',
    note: null,
    payeeName: null,
  };
}

describe('assignShortIds', () => {
  const TX1 = generateRandomRecordId();
  const TX2 = generateRandomRecordId();
  const CAT_PARENT = generateRandomRecordId();
  const CAT_CHILD = generateRandomRecordId();

  const transactions = [makeTransaction({ id: TX1 }), makeTransaction({ id: TX2 })];
  const categories: CategoryForCategorization[] = [
    { id: CAT_PARENT, parentId: null, name: 'Food' },
    { id: CAT_CHILD, parentId: CAT_PARENT, name: 'Coffee' },
  ];

  it('assigns sequential prefixed aliases in input order', () => {
    const mapping = assignShortIds({ transactions, categories });

    expect(mapping.aliasedTransactions.map((tx) => tx.id)).toEqual(['t1', 't2']);
    expect(mapping.aliasedCategories.map((cat) => cat.id)).toEqual(['c1', 'c2']);
  });

  it('preserves non-id fields on aliased records', () => {
    const mapping = assignShortIds({ transactions, categories });

    expect(mapping.aliasedTransactions[0]).toEqual({ ...transactions[0], id: 't1' });
    expect(mapping.aliasedCategories[1]).toMatchObject({ name: 'Coffee' });
  });

  it('translates aliases back to original UUIDs', () => {
    const mapping = assignShortIds({ transactions, categories });

    expect(mapping.transactionIdByAlias.get('t1')).toBe(TX1);
    expect(mapping.transactionIdByAlias.get('t2')).toBe(TX2);
    expect(mapping.categoryIdByAlias.get('c1')).toBe(CAT_PARENT);
    expect(mapping.categoryIdByAlias.get('c2')).toBe(CAT_CHILD);
  });

  it('remaps parentId to the parent category alias', () => {
    const mapping = assignShortIds({ transactions, categories });

    expect(mapping.aliasedCategories[0]!.parentId).toBeNull();
    expect(mapping.aliasedCategories[1]!.parentId).toBe('c1');
  });

  it('drops parentId pointing outside the provided list instead of leaking the UUID', () => {
    const orphan: CategoryForCategorization = {
      id: generateRandomRecordId(),
      parentId: generateRandomRecordId(),
      name: 'Orphan',
    };

    const mapping = assignShortIds({ transactions: [], categories: [orphan] });

    expect(mapping.aliasedCategories[0]!.parentId).toBeNull();
  });

  it('handles empty inputs', () => {
    const mapping = assignShortIds({ transactions: [], categories: [] });

    expect(mapping.aliasedTransactions).toEqual([]);
    expect(mapping.aliasedCategories).toEqual([]);
    expect(mapping.transactionIdByAlias.size).toBe(0);
    expect(mapping.categoryIdByAlias.size).toBe(0);
  });
});
