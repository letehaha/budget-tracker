import { describe, expect, it, jest } from '@jest/globals';

import { parseCategorizationResponse } from './parse-response';

// Only mock the logger
jest.mock('@js/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

describe('parseCategorizationResponse', () => {
  const validCategoryIds = new Set([1, 2, 3, 10, 20]);
  const validTransactionIds = new Set([100, 200, 300, 400]);

  it('parses valid single-line response', () => {
    const response = '100:1';

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([{ transactionId: 100, categoryId: 1 }]);
  });

  it('parses valid multi-line response', () => {
    const response = `100:1
200:2
300:3`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, categoryId: 1 },
      { transactionId: 200, categoryId: 2 },
      { transactionId: 300, categoryId: 3 },
    ]);
  });

  it('skips comment lines starting with #', () => {
    const response = `# This is a comment
100:1
# Another comment
200:2`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, categoryId: 1 },
      { transactionId: 200, categoryId: 2 },
    ]);
  });

  it('skips empty lines', () => {
    const response = `100:1

200:2

`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, categoryId: 1 },
      { transactionId: 200, categoryId: 2 },
    ]);
  });

  it('skips lines with invalid format', () => {
    const response = `100:1
invalid line
200:2
100-3
300:`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, categoryId: 1 },
      { transactionId: 200, categoryId: 2 },
    ]);
  });

  it('filters out unknown transaction IDs', () => {
    const response = `100:1
999:2
200:3`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, categoryId: 1 },
      { transactionId: 200, categoryId: 3 },
    ]);
  });

  it('filters out invalid category IDs', () => {
    const response = `100:1
200:999
300:3`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, categoryId: 1 },
      { transactionId: 300, categoryId: 3 },
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
    const response = `# Comment 1
# Comment 2`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([]);
  });

  it('trims whitespace from lines', () => {
    const response = `  100:1
   200:2
300:3   `;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, categoryId: 1 },
      { transactionId: 200, categoryId: 2 },
      { transactionId: 300, categoryId: 3 },
    ]);
  });

  it('rejects lines with extra content after valid format', () => {
    const response = `100:1 extra stuff
200:2`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    // "100:1 extra stuff" doesn't match /^\d+:\d+$/ so it's skipped
    expect(result).toEqual([{ transactionId: 200, categoryId: 2 }]);
  });

  it('handles large IDs', () => {
    const largeTransactionIds = new Set([123456789]);
    const largeCategoryIds = new Set([987654321]);

    const result = parseCategorizationResponse({
      response: '123456789:987654321',
      validCategoryIds: largeCategoryIds,
      validTransactionIds: largeTransactionIds,
    });

    expect(result).toEqual([{ transactionId: 123456789, categoryId: 987654321 }]);
  });
});
