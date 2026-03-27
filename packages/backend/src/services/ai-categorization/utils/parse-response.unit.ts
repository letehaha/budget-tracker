import { describe, expect, it, jest } from '@jest/globals';

import { parseCategorizationResponse, parseTagSuggestionResponse } from './parse-response';

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

  it('parses combined format (C: prefix)', () => {
    const response = `C:100:1
C:200:2`;

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

  it('parses mixed combined and legacy format', () => {
    const response = `C:100:1
200:2
C:300:3`;

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

  it('skips T: tag lines in categorization parser', () => {
    const response = `C:100:1
T:100:5
C:200:2
T:200:10`;

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

  it('filters invalid IDs in combined format', () => {
    const response = `C:999:1
C:100:999
C:200:2`;

    const result = parseCategorizationResponse({
      response,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual([{ transactionId: 200, categoryId: 2 }]);
  });
});

describe('parseTagSuggestionResponse', () => {
  const validTagIds = new Set([5, 10, 15, 20]);
  const validTransactionIds = new Set([100, 200, 300, 400]);

  it('parses valid T: lines', () => {
    const response = `T:100:5
T:200:10`;

    const result = parseTagSuggestionResponse({
      response,
      validTagIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, tagId: 5 },
      { transactionId: 200, tagId: 10 },
    ]);
  });

  it('ignores C: lines and legacy format', () => {
    const response = `C:100:1
T:100:5
200:2
T:200:10`;

    const result = parseTagSuggestionResponse({
      response,
      validTagIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, tagId: 5 },
      { transactionId: 200, tagId: 10 },
    ]);
  });

  it('filters out unknown transaction IDs', () => {
    const response = `T:100:5
T:999:10
T:200:15`;

    const result = parseTagSuggestionResponse({
      response,
      validTagIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, tagId: 5 },
      { transactionId: 200, tagId: 15 },
    ]);
  });

  it('filters out invalid tag IDs', () => {
    const response = `T:100:5
T:200:999
T:300:15`;

    const result = parseTagSuggestionResponse({
      response,
      validTagIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, tagId: 5 },
      { transactionId: 300, tagId: 15 },
    ]);
  });

  it('handles empty response', () => {
    const result = parseTagSuggestionResponse({
      response: '',
      validTagIds,
      validTransactionIds,
    });

    expect(result).toEqual([]);
  });

  it('handles response with no T: lines', () => {
    const response = `C:100:1
C:200:2
# comment`;

    const result = parseTagSuggestionResponse({
      response,
      validTagIds,
      validTransactionIds,
    });

    expect(result).toEqual([]);
  });

  it('ignores malformed T: lines', () => {
    const response = `T:100:5
T:abc:10
T:200:
T::15
T:300:20`;

    const result = parseTagSuggestionResponse({
      response,
      validTagIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, tagId: 5 },
      { transactionId: 300, tagId: 20 },
    ]);
  });

  it('trims whitespace from lines', () => {
    const response = `  T:100:5
   T:200:10  `;

    const result = parseTagSuggestionResponse({
      response,
      validTagIds,
      validTransactionIds,
    });

    expect(result).toEqual([
      { transactionId: 100, tagId: 5 },
      { transactionId: 200, tagId: 10 },
    ]);
  });
});
