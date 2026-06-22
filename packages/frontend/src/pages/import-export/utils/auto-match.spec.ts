import { describe, expect, it, test } from 'vitest';

import {
  COLUMN_SYNONYMS,
  EXPENSE_VALUE_SYNONYMS,
  INCOME_VALUE_SYNONYMS,
  classifyTransactionTypeValues,
  matchColumns,
  matchValuesByName,
  normalizeHeader,
} from './auto-match';

// ---------------------------------------------------------------------------
// normalizeHeader
// ---------------------------------------------------------------------------

describe('normalizeHeader', () => {
  test.each([
    ['date', 'date'],
    ['Date', 'date'],
    ['DATE', 'date'],
    ['Tx Date', 'txdate'],
    ['tx_date', 'txdate'],
    ['tx-date', 'txdate'],
    ['TxDate', 'txdate'],
    ['Transaction Amount', 'transactionamount'],
    ['transaction_amount', 'transactionamount'],
    ['transaction-amount', 'transactionamount'],
    ['  amount  ', 'amount'],
    ['ISO_Currency', 'isocurrency'],
    ['categoría', 'categora'], // accent stripped as non-alphanumeric
    ['gross_amount', 'grossamount'],
  ])('normalizeHeader(%j) → %j', (input, expected) => {
    expect(normalizeHeader(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// COLUMN_SYNONYMS shape
// ---------------------------------------------------------------------------

describe('COLUMN_SYNONYMS', () => {
  const fields = [
    'date',
    'amount',
    'description',
    'category',
    'account',
    'currency',
    'payee',
    'tags',
    'transactionType',
  ] as const;

  it('exports exactly the 9 expected fields', () => {
    expect(Object.keys(COLUMN_SYNONYMS).sort()).toEqual([...fields].sort());
  });

  it.each(fields)('field %s has a non-empty synonym array', (field) => {
    expect(COLUMN_SYNONYMS[field].length).toBeGreaterThan(0);
  });

  it('date synonyms start with "date"', () => {
    expect(COLUMN_SYNONYMS.date[0]).toBe('date');
  });

  it('amount synonyms start with "amount"', () => {
    expect(COLUMN_SYNONYMS.amount[0]).toBe('amount');
  });

  it('transactionType synonyms contain "type"', () => {
    expect(COLUMN_SYNONYMS.transactionType).toContain('type');
  });
});

// ---------------------------------------------------------------------------
// matchColumns — confidence tiering
// ---------------------------------------------------------------------------

describe('matchColumns – confidence tiering', () => {
  it('exact match wins over starts-with and contains', () => {
    // "date" is an exact synonym; "dated" would be starts-with; "updatedate" contains
    const result = matchColumns({ headers: ['updatedate', 'dated', 'date'] });
    expect(result.date).toEqual({ column: 'date', confidence: 'exact' });
  });

  it('starts-with wins over contains when no exact match', () => {
    // "dated" starts with synonym "date"; "updatedate" contains synonym "date"
    const result = matchColumns({ headers: ['updatedate', 'dated'] });
    expect(result.date).toEqual({ column: 'dated', confidence: 'starts-with' });
  });

  it('contains match is returned when nothing better exists', () => {
    const result = matchColumns({ headers: ['updatedate'] });
    expect(result.date).toEqual({ column: 'updatedate', confidence: 'contains' });
  });

  it('case and separator differences do not prevent matching', () => {
    const result = matchColumns({ headers: ['Transaction_Amount'] });
    expect(result.amount).toEqual({ column: 'Transaction_Amount', confidence: 'exact' });
  });

  it('earlier synonyms outrank later ones at the same tier', () => {
    // Both "desc" (index 1) and "note" (index 2) are exact synonyms for description;
    // "desc" should win because it appears earlier in the synonym list.
    const result = matchColumns({ headers: ['note', 'desc'] });
    expect(result.description).toEqual({ column: 'desc', confidence: 'exact' });
  });
});

// ---------------------------------------------------------------------------
// matchColumns — greedy assignment / field priority
// ---------------------------------------------------------------------------

describe('matchColumns – greedy assignment', () => {
  it('a header claimed by a higher-priority field is not reused by a lower-priority field', () => {
    // "value" is a synonym for both amount AND description (via "value" in amount list)
    // amount has higher priority than description
    const result = matchColumns({ headers: ['value'] });
    expect(result.amount).not.toBeNull();
    expect(result.description).toBeNull();
  });

  it('realistic clean bank export: all 6 standard columns matched', () => {
    const headers = ['Date', 'Amount', 'Category', 'Account', 'Currency', 'Note'];
    const result = matchColumns({ headers });

    expect(result.date).toEqual({ column: 'Date', confidence: 'exact' });
    expect(result.amount).toEqual({ column: 'Amount', confidence: 'exact' });
    expect(result.category).toEqual({ column: 'Category', confidence: 'exact' });
    expect(result.account).toEqual({ column: 'Account', confidence: 'exact' });
    expect(result.currency).toEqual({ column: 'Currency', confidence: 'exact' });
    expect(result.description).toEqual({ column: 'Note', confidence: 'exact' });
  });

  it('messy headers with partial matches', () => {
    // "tx_date_posted" contains "txdate" after normalisation → contains
    // "total_amount"   starts with normalised synonym "amount"? No — but "total" is a synonym → exact
    const headers = ['tx_date_posted', 'total_amount', 'Merchant', 'iso_currency'];
    const result = matchColumns({ headers });

    expect(result.date?.column).toBe('tx_date_posted');
    expect(result.date?.confidence).toBe('contains');

    expect(result.amount?.column).toBe('total_amount');

    expect(result.payee).toEqual({ column: 'Merchant', confidence: 'exact' });

    expect(result.currency?.column).toBe('iso_currency');
    expect(result.currency?.confidence).toBe('exact');
  });

  it('each header assigned to at most one field across all 9 fields', () => {
    const headers = ['date', 'amount', 'description', 'category', 'account', 'currency', 'payee', 'tags', 'type'];
    const result = matchColumns({ headers });

    const assignedColumns = Object.values(result)
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map((m) => m.column);

    // No duplicates — Set size equals array length
    expect(new Set(assignedColumns).size).toBe(assignedColumns.length);
  });

  it('no-match fields return null', () => {
    const result = matchColumns({ headers: ['foo', 'bar', 'baz'] });

    expect(result.date).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.description).toBeNull();
    expect(result.category).toBeNull();
    expect(result.account).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.payee).toBeNull();
    expect(result.tags).toBeNull();
    expect(result.transactionType).toBeNull();
  });

  it('empty header list → all null', () => {
    const result = matchColumns({ headers: [] });
    for (const field of Object.keys(result) as (keyof typeof result)[]) {
      expect(result[field]).toBeNull();
    }
  });

  it('transactionType "type" column not stolen by description field', () => {
    // "type" is not a description synonym; it should go to transactionType
    const result = matchColumns({ headers: ['type', 'memo'] });
    expect(result.transactionType).toEqual({ column: 'type', confidence: 'exact' });
    expect(result.description).toEqual({ column: 'memo', confidence: 'exact' });
  });

  it('priority: date wins over amount when single ambiguous header could match both', () => {
    // "dt" is a date synonym; not an amount synonym — sanity check priority does not interfere
    const result = matchColumns({ headers: ['dt'] });
    expect(result.date).toEqual({ column: 'dt', confidence: 'exact' });
    expect(result.amount).toBeNull();
  });

  it('account claimed before description when header matches account synonym exactly', () => {
    // "bank" is an account synonym; not a description synonym
    const result = matchColumns({ headers: ['bank', 'note'] });
    expect(result.account).toEqual({ column: 'bank', confidence: 'exact' });
    expect(result.description).toEqual({ column: 'note', confidence: 'exact' });
  });

  it('full header set with all 9 fields covered returns one match per field', () => {
    const headers = [
      'transaction_date', // date (exact after normalise)
      'gross_amount', // amount (exact)
      'memo', // description (exact)
      'categoria', // category (exact)
      'wallet', // account (exact)
      'ccy', // currency (exact)
      'beneficiary', // payee (exact)
      'label', // tags (exact)
      'direction', // transactionType (exact)
    ];
    const result = matchColumns({ headers });

    expect(result.date?.column).toBe('transaction_date');
    expect(result.amount?.column).toBe('gross_amount');
    expect(result.description?.column).toBe('memo');
    expect(result.category?.column).toBe('categoria');
    expect(result.account?.column).toBe('wallet');
    expect(result.currency?.column).toBe('ccy');
    expect(result.payee?.column).toBe('beneficiary');
    expect(result.tags?.column).toBe('label');
    expect(result.transactionType?.column).toBe('direction');
  });
});

// ---------------------------------------------------------------------------
// matchValuesByName
// ---------------------------------------------------------------------------

describe('matchValuesByName', () => {
  const targets = [
    { id: 1, name: 'Groceries' },
    { id: 2, name: 'Transport' },
    { id: 3, name: 'BBVA Uruguay', currencyCode: 'UYU' },
    { id: 4, name: 'BBVA Argentina', currencyCode: 'ARS' },
  ];

  it('exact name match returns the target id', () => {
    const result = matchValuesByName({ sources: [{ name: 'Groceries' }], targets });
    expect(result.get('Groceries')).toBe(1);
  });

  it('case-insensitive name match', () => {
    const result = matchValuesByName({ sources: [{ name: 'groceries' }], targets });
    expect(result.get('groceries')).toBe(1);
  });

  it('separator-insensitive name match', () => {
    const result = matchValuesByName({
      sources: [{ name: 'BBVA_Uruguay', currencyCode: 'UYU' }],
      targets,
    });
    expect(result.get('BBVA_Uruguay')).toBe(3);
  });

  it('no match returns null', () => {
    const result = matchValuesByName({ sources: [{ name: 'Unknown' }], targets });
    expect(result.get('Unknown')).toBeNull();
  });

  it('currency-aware: same name, matching currency → linked', () => {
    const result = matchValuesByName({
      sources: [{ name: 'BBVA Uruguay', currencyCode: 'UYU' }],
      targets,
    });
    expect(result.get('BBVA Uruguay')).toBe(3);
  });

  it('currency-aware: same name, different currency → null', () => {
    const result = matchValuesByName({
      sources: [{ name: 'BBVA Uruguay', currencyCode: 'ARS' }],
      targets,
    });
    expect(result.get('BBVA Uruguay')).toBeNull();
  });

  it('currency-aware: source has no currency but target does → matched (only enforce when both present)', () => {
    const result = matchValuesByName({
      sources: [{ name: 'BBVA Uruguay' }], // no currencyCode
      targets,
    });
    expect(result.get('BBVA Uruguay')).toBe(3);
  });

  it('currency-aware: source has currency but target has none → matched (only enforce when both present)', () => {
    const targetsNoCurrency = [{ id: 10, name: 'Groceries' }]; // no currencyCode
    const result = matchValuesByName({
      sources: [{ name: 'Groceries', currencyCode: 'USD' }],
      targets: targetsNoCurrency,
    });
    expect(result.get('Groceries')).toBe(10);
  });

  it('multiple sources each get their own entry in the map', () => {
    const result = matchValuesByName({
      sources: [{ name: 'Groceries' }, { name: 'Transport' }, { name: 'Unknown' }],
      targets,
    });
    expect(result.get('Groceries')).toBe(1);
    expect(result.get('Transport')).toBe(2);
    expect(result.get('Unknown')).toBeNull();
    expect(result.size).toBe(3);
  });

  it('preserves the original (un-normalised) source name as the map key', () => {
    const result = matchValuesByName({ sources: [{ name: 'GROCERIES' }], targets });
    expect(result.has('GROCERIES')).toBe(true);
    expect(result.get('GROCERIES')).toBe(1);
  });

  it('empty sources → empty map', () => {
    const result = matchValuesByName({ sources: [], targets });
    expect(result.size).toBe(0);
  });

  it('empty targets → all null', () => {
    const result = matchValuesByName({ sources: [{ name: 'Groceries' }], targets: [] });
    expect(result.get('Groceries')).toBeNull();
  });

  it('numeric ids are preserved as-is in the returned map', () => {
    const numTargets = [{ id: 99, name: 'Salary' }];
    const result = matchValuesByName({ sources: [{ name: 'salary' }], targets: numTargets });
    expect(result.get('salary')).toBe(99);
  });

  it('string ids are preserved as-is in the returned map', () => {
    const strTargets = [{ id: 'abc-123', name: 'Salary' }];
    const result = matchValuesByName({ sources: [{ name: 'salary' }], targets: strTargets });
    expect(result.get('salary')).toBe('abc-123');
  });
});

// ---------------------------------------------------------------------------
// INCOME_VALUE_SYNONYMS / EXPENSE_VALUE_SYNONYMS shape
// ---------------------------------------------------------------------------

describe('transaction type synonym exports', () => {
  it('INCOME_VALUE_SYNONYMS contains expected values', () => {
    expect(INCOME_VALUE_SYNONYMS).toContain('credit');
    expect(INCOME_VALUE_SYNONYMS).toContain('deposit');
    expect(INCOME_VALUE_SYNONYMS).toContain('in');
    expect(INCOME_VALUE_SYNONYMS).toContain('income');
    expect(INCOME_VALUE_SYNONYMS).toContain('ingreso');
  });

  it('EXPENSE_VALUE_SYNONYMS contains expected values', () => {
    expect(EXPENSE_VALUE_SYNONYMS).toContain('debit');
    expect(EXPENSE_VALUE_SYNONYMS).toContain('withdrawal');
    expect(EXPENSE_VALUE_SYNONYMS).toContain('out');
    expect(EXPENSE_VALUE_SYNONYMS).toContain('expense');
    expect(EXPENSE_VALUE_SYNONYMS).toContain('gasto');
  });

  it('income and expense synonym sets are disjoint', () => {
    const incomeSet = new Set(INCOME_VALUE_SYNONYMS);
    for (const s of EXPENSE_VALUE_SYNONYMS) {
      expect(incomeSet.has(s)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// classifyTransactionTypeValues
// ---------------------------------------------------------------------------

describe('classifyTransactionTypeValues', () => {
  it('classifies credit/debit style values', () => {
    const result = classifyTransactionTypeValues({ distinctValues: ['Credit', 'Debit'] });
    expect(result.income).toEqual(['Credit']);
    expect(result.expense).toEqual(['Debit']);
    expect(result.unknown).toEqual([]);
  });

  it('classifies deposit/withdrawal style values', () => {
    const result = classifyTransactionTypeValues({ distinctValues: ['deposit', 'withdrawal'] });
    expect(result.income).toEqual(['deposit']);
    expect(result.expense).toEqual(['withdrawal']);
    expect(result.unknown).toEqual([]);
  });

  it('classifies in/out style values', () => {
    const result = classifyTransactionTypeValues({ distinctValues: ['IN', 'OUT'] });
    expect(result.income).toEqual(['IN']);
    expect(result.expense).toEqual(['OUT']);
    expect(result.unknown).toEqual([]);
  });

  it('classifies Spanish income/expense terms', () => {
    const result = classifyTransactionTypeValues({ distinctValues: ['ingreso', 'gasto'] });
    expect(result.income).toEqual(['ingreso']);
    expect(result.expense).toEqual(['gasto']);
    expect(result.unknown).toEqual([]);
  });

  it('unknown values land in the unknown bucket', () => {
    const result = classifyTransactionTypeValues({ distinctValues: ['TRANSFER', 'REFUND', 'credit'] });
    expect(result.income).toEqual(['credit']);
    expect(result.expense).toEqual([]);
    expect(result.unknown).toEqual(['TRANSFER', 'REFUND']);
  });

  it('matching is case-insensitive (normalises before lookup)', () => {
    const result = classifyTransactionTypeValues({ distinctValues: ['CREDIT', 'DEBIT', 'Credit', 'Debit'] });
    expect(result.income).toEqual(['CREDIT', 'Credit']);
    expect(result.expense).toEqual(['DEBIT', 'Debit']);
    expect(result.unknown).toEqual([]);
  });

  it('matching is separator-insensitive', () => {
    // "in come" normalises to "income" → income
    const result = classifyTransactionTypeValues({ distinctValues: ['in come', 'atm_fee'] });
    expect(result.income).toContain('in come');
    // "atm_fee" normalises to "atmfee" → not in any synonym list → unknown
    expect(result.unknown).toContain('atm_fee');
  });

  it('empty input returns empty buckets', () => {
    const result = classifyTransactionTypeValues({ distinctValues: [] });
    expect(result.income).toEqual([]);
    expect(result.expense).toEqual([]);
    expect(result.unknown).toEqual([]);
  });

  it('preserves original raw string in the bucket (not normalised form)', () => {
    const result = classifyTransactionTypeValues({ distinctValues: ['CREDIT'] });
    expect(result.income[0]).toBe('CREDIT');
  });

  it('mixed realistic bank export values', () => {
    const result = classifyTransactionTypeValues({
      distinctValues: ['credit', 'debit', 'TRANSFER', 'FEE'],
    });
    expect(result.income).toEqual(['credit']);
    expect(result.expense).toEqual(['debit']);
    expect(result.unknown).toEqual(['TRANSFER', 'FEE']);
  });
});
