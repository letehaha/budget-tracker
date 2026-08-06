import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('unpdf', () => ({
  getDocumentProxy: jest.fn(),
  extractText: jest.fn(),
}));

import {
  ENCRYPTED_STATEMENT_MERCHANT,
  ENCRYPTED_STATEMENT_PASSWORD,
  STATEMENT_PDF_FIXTURES,
  readStatementPdfFixture,
} from '@tests/fixtures/statement-parser-fixtures';
import { extractText, getDocumentProxy } from 'unpdf';

import { estimateTokenCount, extractTextFromFile } from './text-extractor';

const mockedGetDocumentProxy = jest.mocked(getDocumentProxy);
const mockedExtractText = jest.mocked(extractText);

const FAKE_PDF_PROXY = { numPages: 3 } as unknown as Awaited<ReturnType<typeof getDocumentProxy>>;

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks drops calls but keeps implementations, so without an explicit reset
  // the real-unpdf block below would keep parsing for every test declared after it.
  mockedGetDocumentProxy.mockReset();
  mockedExtractText.mockReset();
  mockedGetDocumentProxy.mockResolvedValue(FAKE_PDF_PROXY);
});

describe('extractTextFromFile', () => {
  describe('csv', () => {
    it('returns trimmed text and pageCount=1 for a non-empty CSV', async () => {
      const buffer = Buffer.from('  date,amount\n2026-01-01,12.34  ');

      const result = await extractTextFromFile({ buffer, fileType: 'csv' });

      expect(result).toEqual({
        success: true,
        text: 'date,amount\n2026-01-01,12.34',
        pageCount: 1,
        fileType: 'csv',
      });
    });

    it('fails when CSV has fewer than 10 characters of content', async () => {
      const buffer = Buffer.from('short');

      const result = await extractTextFromFile({ buffer, fileType: 'csv' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/too little text/i);
      expect(result.fileType).toBe('csv');
    });

    it('fails when CSV is whitespace-only', async () => {
      const buffer = Buffer.from('   \n\n   ');

      const result = await extractTextFromFile({ buffer, fileType: 'csv' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/too little text/i);
    });
  });

  describe('txt', () => {
    it('returns trimmed text and pageCount=1 for a non-empty TXT', async () => {
      const buffer = Buffer.from('hello world from a statement\n');

      const result = await extractTextFromFile({ buffer, fileType: 'txt' });

      expect(result).toEqual({
        success: true,
        text: 'hello world from a statement',
        pageCount: 1,
        fileType: 'txt',
      });
    });

    it('fails when TXT is too short', async () => {
      const buffer = Buffer.from('hi');

      const result = await extractTextFromFile({ buffer, fileType: 'txt' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/too little text/i);
    });
  });

  describe('pdf', () => {
    const longText = 'Statement detail line. '.repeat(10);

    it('returns merged text + totalPages from unpdf on the happy path', async () => {
      mockedExtractText.mockResolvedValue({ text: longText, totalPages: 4 });

      const result = await extractTextFromFile({
        buffer: Buffer.from('%PDF-1.4 fake'),
        fileType: 'pdf',
      });

      expect(result.success).toBe(true);
      expect(result.text).toBe(longText.trim());
      expect(result.pageCount).toBe(4);
      expect(result.fileType).toBe('pdf');
    });

    it('passes isEvalSupported: false to getDocumentProxy (defense in depth)', async () => {
      mockedExtractText.mockResolvedValue({ text: longText, totalPages: 1 });
      const buffer = Buffer.from('%PDF-1.4 fake');

      await extractTextFromFile({ buffer, fileType: 'pdf' });

      expect(mockedGetDocumentProxy).toHaveBeenCalledTimes(1);
      const [data, options] = mockedGetDocumentProxy.mock.calls[0]!;
      expect(data).toBeInstanceOf(Uint8Array);
      expect((data as Uint8Array).byteLength).toBe(buffer.byteLength);
      expect(options).toEqual({ isEvalSupported: false });
    });

    it('forwards the document password to getDocumentProxy', async () => {
      mockedExtractText.mockResolvedValue({ text: longText, totalPages: 1 });

      await extractTextFromFile({ buffer: Buffer.from('%PDF-1.4 fake'), fileType: 'pdf', password: 'hunter2' });

      const [, options] = mockedGetDocumentProxy.mock.calls[0]!;
      expect(options).toEqual({ isEvalSupported: false, password: 'hunter2' });
    });

    it('calls extractText with mergePages: true', async () => {
      mockedExtractText.mockResolvedValue({ text: longText, totalPages: 1 });

      await extractTextFromFile({
        buffer: Buffer.from('%PDF-1.4 fake'),
        fileType: 'pdf',
      });

      expect(mockedExtractText).toHaveBeenCalledWith(FAKE_PDF_PROXY, { mergePages: true });
    });

    it('fails with "scanned document" hint when extracted text is too short (<50 chars)', async () => {
      mockedExtractText.mockResolvedValue({ text: 'tiny', totalPages: 2 });

      const result = await extractTextFromFile({
        buffer: Buffer.from('%PDF-1.4 fake'),
        fileType: 'pdf',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/scanned document/i);
      expect(result.errorCode).toBe('NO_TEXT_CONTENT');
      expect(result.text).toBe('tiny');
      expect(result.pageCount).toBe(2);
    });

    it('falls back to pageCount=1 when totalPages is 0', async () => {
      mockedExtractText.mockResolvedValue({ text: longText, totalPages: 0 });

      const result = await extractTextFromFile({
        buffer: Buffer.from('%PDF-1.4 fake'),
        fileType: 'pdf',
      });

      expect(result.pageCount).toBe(1);
    });

    it('returns the error message when unpdf throws an Error', async () => {
      mockedExtractText.mockRejectedValue(new Error('corrupt PDF'));

      const result = await extractTextFromFile({
        buffer: Buffer.from('%PDF-1.4 fake'),
        fileType: 'pdf',
      });

      expect(result).toEqual({
        success: false,
        fileType: 'pdf',
        error: 'corrupt PDF',
        errorCode: 'PARSE_FAILED',
      });
    });

    it('returns a generic message when unpdf throws a non-Error value', async () => {
      mockedExtractText.mockRejectedValue('weird string failure');

      const result = await extractTextFromFile({
        buffer: Buffer.from('%PDF-1.4 fake'),
        fileType: 'pdf',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to parse PDF');
    });
  });

  // The classification under test is pdf.js's own, so these run the real parser
  // over committed fixtures instead of the module mock used above.
  describe('pdf fixtures parsed by the real unpdf', () => {
    const REAL_PDFJS_TIMEOUT_MS = 15_000;

    beforeEach(() => {
      const actualUnpdf = jest.requireActual<typeof import('unpdf')>('unpdf');
      mockedGetDocumentProxy.mockImplementation(actualUnpdf.getDocumentProxy);
      mockedExtractText.mockImplementation(actualUnpdf.extractText);
    });

    it(
      'reports PASSWORD_REQUIRED for an encrypted PDF opened without a password',
      async () => {
        const buffer = readStatementPdfFixture({ file: STATEMENT_PDF_FIXTURES.encrypted });

        const result = await extractTextFromFile({ buffer, fileType: 'pdf' });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('PASSWORD_REQUIRED');
      },
      REAL_PDFJS_TIMEOUT_MS,
    );

    it(
      'reports PASSWORD_INVALID for an encrypted PDF opened with the wrong password',
      async () => {
        const buffer = readStatementPdfFixture({ file: STATEMENT_PDF_FIXTURES.encrypted });

        const result = await extractTextFromFile({ buffer, fileType: 'pdf', password: 'not-the-password' });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('PASSWORD_INVALID');
      },
      REAL_PDFJS_TIMEOUT_MS,
    );

    it(
      'extracts the statement text when the correct password is given',
      async () => {
        const buffer = readStatementPdfFixture({ file: STATEMENT_PDF_FIXTURES.encrypted });

        const result = await extractTextFromFile({
          buffer,
          fileType: 'pdf',
          password: ENCRYPTED_STATEMENT_PASSWORD,
        });

        expect(result.success).toBe(true);
        expect(result.errorCode).toBeUndefined();
        expect(result.text).toContain(ENCRYPTED_STATEMENT_MERCHANT);
      },
      REAL_PDFJS_TIMEOUT_MS,
    );

    it(
      'reports NO_TEXT_CONTENT for a PDF page that carries no text',
      async () => {
        const buffer = readStatementPdfFixture({ file: STATEMENT_PDF_FIXTURES.noTextLayer });

        const result = await extractTextFromFile({ buffer, fileType: 'pdf' });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('NO_TEXT_CONTENT');
      },
      REAL_PDFJS_TIMEOUT_MS,
    );
  });

  describe('unsupported file types', () => {
    it('returns an unsupported-type error', async () => {
      const result = await extractTextFromFile({
        buffer: Buffer.from('payload'),
        // @ts-expect-error — exercising the runtime fallback
        fileType: 'docx',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unsupported file type: docx/i);
    });
  });
});

describe('estimateTokenCount', () => {
  it('returns a positive integer for non-empty text', () => {
    const tokens = estimateTokenCount({ text: 'The quick brown fox jumps over the lazy dog.' });
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });

  it('returns 0 for empty text', () => {
    expect(estimateTokenCount({ text: '' })).toBe(0);
  });

  it('reuses the cached encoder across calls (no errors on repeated invocation)', () => {
    const a = estimateTokenCount({ text: 'first call' });
    const b = estimateTokenCount({ text: 'second call' });
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });
});
