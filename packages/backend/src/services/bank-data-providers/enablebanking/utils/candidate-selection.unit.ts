import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import { filterIbanCompatible, pickNearestByDate } from './candidate-selection';

const IBAN = 'FR7630006000011234567890189';
const OTHER_IBAN = 'DE89370400440532013000';

function expenseRow({ id, creditorAccount }: { id: string; creditorAccount?: string }) {
  return {
    id,
    time: new Date('2026-05-01T00:00:00.000Z'),
    transactionType: TRANSACTION_TYPES.expense,
    externalData: creditorAccount ? { creditorAccount } : {},
  };
}

function incomeRow({ id, debtorAccount }: { id: string; debtorAccount?: string }) {
  return {
    id,
    time: new Date('2026-05-01T00:00:00.000Z'),
    transactionType: TRANSACTION_TYPES.income,
    externalData: debtorAccount ? { debtorAccount } : {},
  };
}

function datedRow({ id, date }: { id: string; date: string }) {
  return {
    id,
    time: new Date(date),
    transactionType: TRANSACTION_TYPES.expense,
    externalData: {},
  };
}

describe('filterIbanCompatible', () => {
  it('keeps only the candidates carrying the same IBAN as the reference', () => {
    const match = expenseRow({ id: 'a', creditorAccount: IBAN });
    const mismatch = expenseRow({ id: 'b', creditorAccount: OTHER_IBAN });

    const result = filterIbanCompatible({ candidates: [match, mismatch], counterpartyIban: IBAN });

    expect(result).toEqual([match]);
  });

  it('rejects an IBAN-less candidate when the reference has an IBAN', () => {
    const ibanLess = expenseRow({ id: 'a' });

    const result = filterIbanCompatible({ candidates: [ibanLess], counterpartyIban: IBAN });

    expect(result).toEqual([]);
  });

  it('filters nothing when the reference has no IBAN', () => {
    const candidates = [expenseRow({ id: 'a', creditorAccount: IBAN }), expenseRow({ id: 'b' })];

    const result = filterIbanCompatible({ candidates, counterpartyIban: null });

    expect(result).toEqual(candidates);
  });

  it('reads debtorAccount on income candidates', () => {
    const match = incomeRow({ id: 'a', debtorAccount: IBAN });
    const wrongField = expenseRow({ id: 'b', creditorAccount: IBAN });

    const result = filterIbanCompatible({ candidates: [match, wrongField], counterpartyIban: IBAN });

    expect(result).toEqual([match, wrongField]);
  });

  it('returns an empty list for no candidates', () => {
    expect(filterIbanCompatible({ candidates: [], counterpartyIban: IBAN })).toEqual([]);
  });
});

describe('pickNearestByDate', () => {
  it('picks the candidate closest to the target date', () => {
    const near = datedRow({ id: 'a', date: '2026-05-03T00:00:00.000Z' });
    const far = datedRow({ id: 'b', date: '2026-04-28T00:00:00.000Z' });

    const result = pickNearestByDate({ candidates: [far, near], date: new Date('2026-05-04T00:00:00.000Z') });

    expect(result).toBe(near);
  });

  it('treats earlier and later candidates by absolute distance', () => {
    const before = datedRow({ id: 'a', date: '2026-05-03T00:00:00.000Z' });
    const after = datedRow({ id: 'b', date: '2026-05-08T00:00:00.000Z' });

    const result = pickNearestByDate({ candidates: [after, before], date: new Date('2026-05-04T00:00:00.000Z') });

    expect(result).toBe(before);
  });

  it('breaks ties on id so the choice does not depend on input order', () => {
    const first = datedRow({ id: 'aaa', date: '2026-05-03T00:00:00.000Z' });
    const second = datedRow({ id: 'bbb', date: '2026-05-05T00:00:00.000Z' });
    const date = new Date('2026-05-04T00:00:00.000Z');

    expect(pickNearestByDate({ candidates: [first, second], date })).toBe(first);
    expect(pickNearestByDate({ candidates: [second, first], date })).toBe(first);
  });

  it('leaves the input array untouched', () => {
    const first = datedRow({ id: 'a', date: '2026-05-08T00:00:00.000Z' });
    const second = datedRow({ id: 'b', date: '2026-05-03T00:00:00.000Z' });
    const candidates = [first, second];

    pickNearestByDate({ candidates, date: new Date('2026-05-04T00:00:00.000Z') });

    expect(candidates).toEqual([first, second]);
  });

  it('returns null when there are no candidates', () => {
    expect(pickNearestByDate({ candidates: [], date: new Date('2026-05-04T00:00:00.000Z') })).toBeNull();
  });
});
