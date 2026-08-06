import type { StatementTextExtractionErrorCode } from '@bt/shared/types';
import { i18nextReady } from '@i18n/index';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { resolveTextExtractionSuggestion } from './text-extraction-suggestion';

beforeAll(async () => {
  // The suggestions are translated strings, so the locale has to be loaded to compare them
  await i18nextReady;
});

/** What a PDF with no usable text falls back to when nothing more specific applies. */
const scannedDocumentDefault = () => resolveTextExtractionSuggestion({ fileType: 'pdf', errorCode: 'NO_TEXT_CONTENT' });

describe('resolveTextExtractionSuggestion', () => {
  describe('pdf', () => {
    it('falls back to the scanned-document message when no code was classified', () => {
      expect(resolveTextExtractionSuggestion({ fileType: 'pdf' })).toBe(scannedDocumentDefault());
    });

    // The fix for a protected PDF (type the password) is useless for a scanned one,
    // so these must never collapse into the same copy.
    it.each<StatementTextExtractionErrorCode>(['PASSWORD_REQUIRED', 'PASSWORD_INVALID', 'PARSE_FAILED'])(
      'gives %s its own message, distinct from the scanned-document default',
      (errorCode) => {
        expect(resolveTextExtractionSuggestion({ fileType: 'pdf', errorCode })).not.toBe(scannedDocumentDefault());
      },
    );

    it('gives every error code a distinct message', () => {
      const codes: StatementTextExtractionErrorCode[] = [
        'PASSWORD_REQUIRED',
        'PASSWORD_INVALID',
        'PARSE_FAILED',
        'NO_TEXT_CONTENT',
      ];

      const messages = codes.map((errorCode) => resolveTextExtractionSuggestion({ fileType: 'pdf', errorCode }));

      expect(new Set(messages).size).toBe(codes.length);
    });
  });

  describe('non-pdf', () => {
    it('uses its own message regardless of the error code', () => {
      const withoutCode = resolveTextExtractionSuggestion({ fileType: 'csv' });

      expect(resolveTextExtractionSuggestion({ fileType: 'csv', errorCode: 'PASSWORD_REQUIRED' })).toBe(withoutCode);
      expect(resolveTextExtractionSuggestion({ fileType: 'csv', errorCode: 'NO_TEXT_CONTENT' })).toBe(withoutCode);
      expect(resolveTextExtractionSuggestion({ fileType: 'txt', errorCode: 'PARSE_FAILED' })).toBe(withoutCode);
      expect(withoutCode).not.toBe(scannedDocumentDefault());
    });
  });
});
