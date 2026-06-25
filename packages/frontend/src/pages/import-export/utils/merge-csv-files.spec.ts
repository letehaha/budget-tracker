import { MAX_CSV_ROWS } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { MergeCsvError, mergeCsvFiles } from './merge-csv-files';

/** Minimal File stand-in: mergeCsvFiles only reads `.name` and calls `.text()`. */
const fakeFile = (name: string, content: string): File =>
  ({ name, text: () => Promise.resolve(content) }) as unknown as File;

/** File whose `.text()` rejects, simulating an unreadable file. */
const unreadableFile = (name: string): File =>
  ({ name, text: () => Promise.reject(new Error('boom')) }) as unknown as File;

/** Re-parses combined CSV output into header + data rows for assertions. */
const parseBack = async (csv: string, delimiter?: string): Promise<{ header: string[]; rows: string[][] }> => {
  const Papa = (await import('papaparse')).default;
  const { data } = Papa.parse<string[]>(csv, { skipEmptyLines: true, delimiter });
  return { header: data[0] ?? [], rows: data.slice(1) };
};

describe('mergeCsvFiles', () => {
  it('merges several files with identical headers into one CSV', async () => {
    const result = await mergeCsvFiles({
      files: [
        fakeFile('jan.csv', 'date,amount,note\n2026-01-01,100,a\n2026-01-02,200,b'),
        fakeFile('feb.csv', 'date,amount,note\n2026-02-01,300,c'),
      ],
    });

    expect(result.headers).toEqual(['date', 'amount', 'note']);
    expect(result.totalDataRows).toBe(3);
    expect(result.perFile).toEqual([
      { name: 'jan.csv', dataRowCount: 2 },
      { name: 'feb.csv', dataRowCount: 1 },
    ]);
    expect(result.dataRows).toEqual([
      ['2026-01-01', '100', 'a'],
      ['2026-01-02', '200', 'b'],
      ['2026-02-01', '300', 'c'],
    ]);

    const { header, rows } = await parseBack(result.combinedContent);
    expect(header).toEqual(['date', 'amount', 'note']);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row[0])).toEqual(['2026-01-01', '2026-01-02', '2026-02-01']);
  });

  it('preserves selection order across files', async () => {
    const result = await mergeCsvFiles({
      files: [fakeFile('b.csv', 'k\nb1\nb2'), fakeFile('a.csv', 'k\na1')],
    });

    const { rows } = await parseBack(result.combinedContent);
    expect(rows.map((row) => row[0])).toEqual(['b1', 'b2', 'a1']);
  });

  it('handles a single file', async () => {
    const result = await mergeCsvFiles({ files: [fakeFile('one.csv', 'date,amount\n2026-01-01,100')] });

    expect(result.totalDataRows).toBe(1);
    expect(result.perFile).toEqual([{ name: 'one.csv', dataRowCount: 1 }]);
  });

  it('keeps values that contain the delimiter intact via quoting', async () => {
    const result = await mergeCsvFiles({
      files: [fakeFile('q.csv', 'date,note\n2026-01-01,"Coffee, tea"')],
    });

    const { rows } = await parseBack(result.combinedContent);
    expect(rows[0]).toEqual(['2026-01-01', 'Coffee, tea']);
  });

  it('merges files that use different delimiters but the same columns', async () => {
    const result = await mergeCsvFiles({
      files: [
        fakeFile('comma.csv', 'date,amount\n2026-01-01,100'),
        fakeFile('semi.csv', 'date;amount\n2026-02-01;200'),
      ],
    });

    expect(result.headers).toEqual(['date', 'amount']);
    expect(result.totalDataRows).toBe(2);
    const { rows } = await parseBack(result.combinedContent);
    expect(rows).toEqual([
      ['2026-01-01', '100'],
      ['2026-02-01', '200'],
    ]);
  });

  it('rejects an empty selection', async () => {
    await expect(mergeCsvFiles({ files: [] })).rejects.toMatchObject({ code: 'EMPTY_SELECTION' });
  });

  it('rejects when a later file has a mismatched header, naming the file', async () => {
    const promise = mergeCsvFiles({
      files: [fakeFile('a.csv', 'date,amount\n2026-01-01,100'), fakeFile('b.csv', 'date,total\n2026-02-01,200')],
    });

    await expect(promise).rejects.toBeInstanceOf(MergeCsvError);
    await expect(promise).rejects.toMatchObject({
      code: 'HEADER_MISMATCH',
      fileName: 'b.csv',
      meta: { expectedColumns: ['date', 'amount'], actualColumns: ['date', 'total'] },
    });
  });

  it('rejects when columns match by name but differ in order', async () => {
    const promise = mergeCsvFiles({
      files: [fakeFile('a.csv', 'date,amount\n2026-01-01,100'), fakeFile('b.csv', 'amount,date\n200,2026-02-01')],
    });

    await expect(promise).rejects.toMatchObject({ code: 'HEADER_MISMATCH', fileName: 'b.csv' });
  });

  it('rejects an empty file', async () => {
    await expect(mergeCsvFiles({ files: [fakeFile('empty.csv', '   ')] })).rejects.toMatchObject({
      code: 'FILE_EMPTY',
      fileName: 'empty.csv',
    });
  });

  it('rejects a file with a header but no data rows', async () => {
    await expect(mergeCsvFiles({ files: [fakeFile('headeronly.csv', 'date,amount')] })).rejects.toMatchObject({
      code: 'FILE_NO_DATA_ROWS',
      fileName: 'headeronly.csv',
    });
  });

  it('rejects when a file cannot be read', async () => {
    await expect(mergeCsvFiles({ files: [unreadableFile('locked.csv')] })).rejects.toMatchObject({
      code: 'FILE_READ_FAILED',
      fileName: 'locked.csv',
    });
  });

  it('rejects a reserved header name', async () => {
    await expect(mergeCsvFiles({ files: [fakeFile('proto.csv', '__proto__,amount\nx,100')] })).rejects.toMatchObject({
      code: 'FORBIDDEN_HEADER',
      fileName: 'proto.csv',
    });
  });

  it('rejects when the combined row count exceeds the limit', async () => {
    const tooMany = ['date,amount', ...Array.from({ length: MAX_CSV_ROWS + 1 }, (_, i) => `2026-01-01,${i}`)].join(
      '\n',
    );

    await expect(mergeCsvFiles({ files: [fakeFile('big.csv', tooMany)] })).rejects.toMatchObject({
      code: 'TOO_MANY_ROWS',
      meta: { max: MAX_CSV_ROWS },
    });
  });

  it('re-serializes with a custom output delimiter, keeping comma-delimited input intact', async () => {
    // BudgetBakers Wallet parses with ';', so the merge must emit ';' even though the
    // source files (and the default output) are comma-delimited.
    const result = await mergeCsvFiles({
      files: [
        fakeFile('a.csv', 'account,category,amount\nCash,Food,100'),
        fakeFile('b.csv', 'account,category,amount\nBank,Bills,200'),
      ],
      outputDelimiter: ';',
    });

    expect(result.combinedContent).toContain('account;category;amount');
    expect(result.combinedContent).not.toContain('account,category,amount');

    const { header, rows } = await parseBack(result.combinedContent, ';');
    expect(header).toEqual(['account', 'category', 'amount']);
    expect(rows).toEqual([
      ['Cash', 'Food', '100'],
      ['Bank', 'Bills', '200'],
    ]);
  });

  it('quotes fields containing the custom delimiter so the round-trip is lossless', async () => {
    // A note containing the output delimiter (';') must be quoted, or re-parsing
    // with ';' would split it into two columns and corrupt every later column.
    const result = await mergeCsvFiles({
      files: [fakeFile('semi.csv', 'date,note\n2026-01-01,"shopping; groceries"')],
      outputDelimiter: ';',
    });

    const { rows } = await parseBack(result.combinedContent, ';');
    expect(rows[0]).toEqual(['2026-01-01', 'shopping; groceries']);
  });

  it('honors a custom maxRows above the default', async () => {
    // A provider with a higher backend ceiling (e.g. Wallet's 100k) must not be
    // rejected at the default 50k limit.
    const rowCount = MAX_CSV_ROWS + 10;
    const content = ['date,amount', ...Array.from({ length: rowCount }, (_, i) => `2026-01-01,${i}`)].join('\n');

    const result = await mergeCsvFiles({ files: [fakeFile('big.csv', content)], maxRows: MAX_CSV_ROWS + 100 });
    expect(result.totalDataRows).toBe(rowCount);
  });

  it('reports the custom maxRows in the TOO_MANY_ROWS error', async () => {
    const customMax = 3;
    const content = ['date,amount', ...Array.from({ length: customMax + 1 }, (_, i) => `2026-01-01,${i}`)].join('\n');

    await expect(mergeCsvFiles({ files: [fakeFile('big.csv', content)], maxRows: customMax })).rejects.toMatchObject({
      code: 'TOO_MANY_ROWS',
      meta: { max: customMax },
    });
  });

  it('rejects when the combined row count exceeds the limit across multiple files', async () => {
    // Each file stays under the limit on its own; only their sum exceeds it, exercising
    // the per-file aggregation the single-file case can't reach.
    const half = Math.ceil((MAX_CSV_ROWS + 1) / 2);
    const fileWith = (name: string, startId: number) =>
      fakeFile(
        name,
        ['date,amount', ...Array.from({ length: half }, (_, i) => `2026-01-01,${startId + i}`)].join('\n'),
      );

    await expect(mergeCsvFiles({ files: [fileWith('a.csv', 0), fileWith('b.csv', half)] })).rejects.toMatchObject({
      code: 'TOO_MANY_ROWS',
      meta: { max: MAX_CSV_ROWS },
    });
  });
});
