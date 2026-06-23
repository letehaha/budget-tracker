import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// ── Mocks (must be hoisted before any imports from the module under test) ─────

// Stub ExchangeRates.findAll — returns only the rows we want for a given test.
const findAll = jest.fn<() => Promise<{ quoteCode: string }[]>>();
jest.mock('@models/exchange-rates.model', () => ({
  __esModule: true,
  default: {
    findAll: () => findAll(),
  },
}));

// Stub getBaseCurrency — returns a record whose `currency.code` we control.
const getBaseCurrency = jest.fn<() => Promise<{ currency: { code: string } } | null>>();
jest.mock('@models/users-currencies.model', () => ({
  __esModule: true,
  getBaseCurrency: () => getBaseCurrency(),
}));

// eslint-disable-next-line import/first
import type { ParsedTransactionRow } from '@bt/shared/types';
// eslint-disable-next-line import/first
import { asCents } from '@bt/shared/types';

// eslint-disable-next-line import/first
import { findUnpriceableRows } from './find-unpriceable-rows';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(rowIndex: number, currencyCode: string): ParsedTransactionRow {
  return {
    rowIndex,
    date: '2024-01-01T12:00:00.000Z',
    amount: asCents(10000),
    description: 'Test',
    accountName: 'Checking',
    currencyCode,
    transactionType: 'expense',
  };
}

const USER_ID = 1;
const USER_BASE = 'EUR';

// Default stub: user base is EUR, no stored rates.
function setupDefaults() {
  getBaseCurrency.mockResolvedValue({ currency: { code: USER_BASE } });
  findAll.mockResolvedValue([]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('findUnpriceableRows', () => {
  beforeEach(setupDefaults);
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty array when validRows is empty', async () => {
    const result = await findUnpriceableRows({ userId: USER_ID, validRows: [] });
    expect(result).toEqual([]);
    expect(findAll).not.toHaveBeenCalled();
  });

  it('never flags USD (the API_LAYER_BASE_CURRENCY_CODE)', async () => {
    const rows = [makeRow(2, 'USD')];
    const result = await findUnpriceableRows({ userId: USER_ID, validRows: rows });
    expect(result).toEqual([]);
  });

  it("never flags the user's base currency (EUR in this case)", async () => {
    const rows = [makeRow(2, 'EUR')];
    const result = await findUnpriceableRows({ userId: USER_ID, validRows: rows });
    expect(result).toEqual([]);
  });

  it('never flags a currency that has at least one ExchangeRates row stored', async () => {
    findAll.mockResolvedValue([{ quoteCode: 'GBP' }]);
    const rows = [makeRow(2, 'GBP')];
    const result = await findUnpriceableRows({ userId: USER_ID, validRows: rows });
    expect(result).toEqual([]);
  });

  it('flags a currency with no stored ExchangeRates row', async () => {
    findAll.mockResolvedValue([]); // XYZ not in DB
    const rows = [makeRow(2, 'XYZ')];
    const result = await findUnpriceableRows({ userId: USER_ID, validRows: rows });
    expect(result).toEqual([{ rowIndex: 2, currencyCode: 'XYZ' }]);
  });

  it('handles a mixed set — only un-stored currencies are returned', async () => {
    // GBP has a stored rate, XYZ does not, USD and EUR are always priceable.
    findAll.mockResolvedValue([{ quoteCode: 'GBP' }]);
    const rows = [makeRow(2, 'USD'), makeRow(3, 'EUR'), makeRow(4, 'GBP'), makeRow(5, 'XYZ')];
    const result = await findUnpriceableRows({ userId: USER_ID, validRows: rows });
    expect(result).toEqual([{ rowIndex: 5, currencyCode: 'XYZ' }]);
  });

  it('returns all rows when none of the currencies have stored rates', async () => {
    findAll.mockResolvedValue([]); // neither ABC nor XYZ in DB
    const rows = [makeRow(2, 'ABC'), makeRow(3, 'XYZ')];
    const result = await findUnpriceableRows({ userId: USER_ID, validRows: rows });
    expect(result).toEqual([
      { rowIndex: 2, currencyCode: 'ABC' },
      { rowIndex: 3, currencyCode: 'XYZ' },
    ]);
  });

  it('deduplicates currency codes before querying the DB', async () => {
    findAll.mockResolvedValue([]); // XYZ not stored
    const rows = [makeRow(2, 'XYZ'), makeRow(3, 'XYZ'), makeRow(4, 'XYZ')];
    await findUnpriceableRows({ userId: USER_ID, validRows: rows });
    // findAll should have been called once, passing XYZ only once in the IN clause.
    expect(findAll).toHaveBeenCalledTimes(1);
    // All three rows are flagged.
    const result = await findUnpriceableRows({ userId: USER_ID, validRows: rows });
    expect(result).toHaveLength(3);
  });

  it('skips the DB query entirely when every row currency is always-priceable', async () => {
    const rows = [makeRow(2, 'USD'), makeRow(3, 'EUR')];
    await findUnpriceableRows({ userId: USER_ID, validRows: rows });
    expect(findAll).not.toHaveBeenCalled();
  });

  it('handles a null base-currency record gracefully (does not crash)', async () => {
    getBaseCurrency.mockResolvedValue(null);
    findAll.mockResolvedValue([]);
    const rows = [makeRow(2, 'XYZ')];
    const result = await findUnpriceableRows({ userId: USER_ID, validRows: rows });
    // With no user base, XYZ still has no rate → flagged.
    expect(result).toEqual([{ rowIndex: 2, currencyCode: 'XYZ' }]);
  });
});
