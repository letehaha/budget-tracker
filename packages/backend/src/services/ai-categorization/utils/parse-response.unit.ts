import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it, jest } from '@jest/globals';

import { parseCategorizationResponse } from './parse-response';

// Only mock the logger
jest.mock('@js/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Test UUIDs for readability
const TX1 = generateRandomRecordId();
const TX2 = generateRandomRecordId();
const TX3 = generateRandomRecordId();
const TX4 = generateRandomRecordId();
const CAT1 = generateRandomRecordId();
const CAT2 = generateRandomRecordId();
const CAT3 = generateRandomRecordId();
const CAT10 = generateRandomRecordId();
const CAT20 = generateRandomRecordId();

describe('parseCategorizationResponse', () => {
  const validCategoryIds = new Set([CAT1, CAT2, CAT3, CAT10, CAT20]);
  const validTransactionIds = new Set([TX1, TX2, TX3, TX4]);

  it('parses valid single-line response', () => {
    const response = `${TX1}:${CAT1}`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([{ transactionId: TX1, categoryId: CAT1 }]);
  });

  it('parses valid multi-line response', () => {
    const response = `${TX1}:${CAT1}\n${TX2}:${CAT2}\n${TX3}:${CAT3}`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: TX1, categoryId: CAT1 },
      { transactionId: TX2, categoryId: CAT2 },
      { transactionId: TX3, categoryId: CAT3 },
    ]);
  });

  it('skips comment lines starting with #', () => {
    const response = `# This is a comment\n${TX1}:${CAT1}\n# Another comment\n${TX2}:${CAT2}`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: TX1, categoryId: CAT1 },
      { transactionId: TX2, categoryId: CAT2 },
    ]);
  });

  it('skips empty lines', () => {
    const response = `${TX1}:${CAT1}\n\n${TX2}:${CAT2}\n\n`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: TX1, categoryId: CAT1 },
      { transactionId: TX2, categoryId: CAT2 },
    ]);
  });

  it('skips lines with invalid format', () => {
    const response = `${TX1}:${CAT1}\ninvalid line\n${TX2}:${CAT2}\n100-3\n${TX3}:`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: TX1, categoryId: CAT1 },
      { transactionId: TX2, categoryId: CAT2 },
    ]);
  });

  it('filters out unknown transaction IDs', () => {
    const unknownTx = generateRandomRecordId();
    const response = `${TX1}:${CAT1}\n${unknownTx}:${CAT2}\n${TX2}:${CAT3}`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: TX1, categoryId: CAT1 },
      { transactionId: TX2, categoryId: CAT3 },
    ]);
  });

  it('filters out invalid category IDs', () => {
    const unknownCat = generateRandomRecordId();
    const response = `${TX1}:${CAT1}\n${TX2}:${unknownCat}\n${TX3}:${CAT3}`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: TX1, categoryId: CAT1 },
      { transactionId: TX3, categoryId: CAT3 },
    ]);
  });

  it('handles empty response', () => {
    const result = parseCategorizationResponse({
      response: '',
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([]);
  });

  it('handles response with only whitespace', () => {
    const result = parseCategorizationResponse({
      response: '   \n\n   ',
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([]);
  });

  it('handles response with only comments', () => {
    const response = `# Comment 1\n# Comment 2`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([]);
  });

  it('trims whitespace from lines', () => {
    const response = `  ${TX1}:${CAT1}\n   ${TX2}:${CAT2}\n${TX3}:${CAT3}   `;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: TX1, categoryId: CAT1 },
      { transactionId: TX2, categoryId: CAT2 },
      { transactionId: TX3, categoryId: CAT3 },
    ]);
  });

  it('rejects lines with extra content after valid format (no extra spaces in UUID format)', () => {
    const response = `${TX1}:${CAT1} extra stuff\n${TX2}:${CAT2}`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    // The extra content after trim would make it not match valid IDs
    expect(result).toEqual([{ transactionId: TX2, categoryId: CAT2 }]);
  });

  it('handles large set of IDs', () => {
    const largeTxId = generateRandomRecordId();
    const largeCatId = generateRandomRecordId();
    const largeTransactionIds = new Set([largeTxId]);
    const largeCategoryIds = new Set([largeCatId]);

    const result = parseCategorizationResponse({
      response: `${largeTxId}:${largeCatId}`,
      validCategoryIds: largeCategoryIds,
      validTransactionIds: largeTransactionIds,
    });

    expect(result).toEqual([{ transactionId: largeTxId, categoryId: largeCatId }]);
  });
});
