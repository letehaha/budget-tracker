import { describe, expect, it } from 'vitest';

import { CsvParseLocalError, parseCsvLocally } from './parse-csv-local';

describe('parseCsvLocally', () => {
  it('leaves normal headers unchanged', async () => {
    const result = await parseCsvLocally({ fileText: 'symbol,date,quantity\nAAPL,2026-01-01,10' });

    expect(result.headers).toEqual(['symbol', 'date', 'quantity']);
    expect(result.preview).toEqual([{ symbol: 'AAPL', date: '2026-01-01', quantity: '10' }]);
  });

  // Regression test for MONEY-MATTER-CLIENT-10: a blank header cell (trailing
  // comma, unnamed index column) used to survive as an empty-string header,
  // which the column-mapping step turned into a `<SelectItem value="">` —
  // reka-ui throws on that and crashed the whole mapping step.
  it('gives a blank header cell a stable positional name instead of an empty string', async () => {
    const result = await parseCsvLocally({ fileText: 'symbol,,quantity\nAAPL,extra,10' });

    expect(result.headers).toEqual(['symbol', 'Column 2', 'quantity']);
    expect(result.headers.every((h) => h.length > 0)).toBe(true);
    expect(result.preview).toEqual([{ symbol: 'AAPL', 'Column 2': 'extra', quantity: '10' }]);
  });

  it('gives a whitespace-only header cell a stable positional name', async () => {
    const result = await parseCsvLocally({ fileText: 'symbol,   ,quantity\nAAPL,extra,10' });

    expect(result.headers).toEqual(['symbol', 'Column 2', 'quantity']);
  });

  it('names multiple blank header cells by their own position', async () => {
    const result = await parseCsvLocally({ fileText: ',symbol,,quantity\nextra,AAPL,extra2,10' });

    expect(result.headers).toEqual(['Column 1', 'symbol', 'Column 3', 'quantity']);
  });

  it('rejects a CSV with no header row', async () => {
    await expect(parseCsvLocally({ fileText: ',,\nfoo,bar,baz' })).rejects.toMatchObject({ code: 'NO_HEADERS' });
  });

  it('rejects an empty file', async () => {
    await expect(parseCsvLocally({ fileText: '   ' })).rejects.toBeInstanceOf(CsvParseLocalError);
  });
});
