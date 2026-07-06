import { describe, expect, it } from '@jest/globals';
import { ValidationError } from '@js/errors';

import { parseCsvRecords } from './parse-csv-records';

describe('parseCsvRecords', () => {
  it('parses well-formed rows', () => {
    const records = parseCsvRecords({ fileContent: 'a;b;c\n1;2;3', delimiter: ';' });
    expect(records).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('preserves a quoted field that contains the delimiter (RFC-4180)', () => {
    const records = parseCsvRecords({ fileContent: 'name,city\nShop,"Zurich, CH"', delimiter: ',' });
    expect(records[1]).toEqual(['Shop', 'Zurich, CH']);
  });

  it('keeps a stray mid-field quote as a literal instead of failing', () => {
    const records = parseCsvRecords({ fileContent: 'memo\nHe said "hi"', delimiter: ',' });
    expect(records[1]?.[0]).toContain('hi');
  });

  it('maps an unrecoverable parse failure to a ValidationError rather than a raw throw', () => {
    // An unterminated quote runs to EOF (CSV_QUOTE_NOT_CLOSED) even with relaxed
    // quotes — the exact class that previously escaped as an HTTP 500.
    expect(() => parseCsvRecords({ fileContent: 'a,b\n"unterminated,c', delimiter: ',' })).toThrow(ValidationError);
  });
});
