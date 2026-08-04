import { CATEGORIZATION_SKIP_REASON } from '@bt/shared/types';
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

const noSkips: unknown[] = [];

describe('parseCategorizationResponse', () => {
  const validCategoryIds = new Set([CAT1, CAT2, CAT3]);
  const validTransactionIds = new Set([TX1, TX2, TX3, TX4]);

  it('parses valid single-line response', () => {
    const result = parseCategorizationResponse({
      response: `${TX1}:${CAT1}`,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual({ categorized: [{ transactionId: TX1, categoryId: CAT1 }], skipped: noSkips });
  });

  it('parses valid multi-line response', () => {
    const result = parseCategorizationResponse({
      response: `${TX1}:${CAT1}\n${TX2}:${CAT2}\n${TX3}:${CAT3}`,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result.categorized).toEqual([
      { transactionId: TX1, categoryId: CAT1 },
      { transactionId: TX2, categoryId: CAT2 },
      { transactionId: TX3, categoryId: CAT3 },
    ]);
    expect(result.skipped).toEqual(noSkips);
  });

  it('parses explicit skip verdicts with their reason codes', () => {
    const result = parseCategorizationResponse({
      response: `${TX1}:${CAT1}\n${TX2}:skip:transfer\n${TX3}:skip:unclear\n${TX4}:skip:no_fit`,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result.categorized).toEqual([{ transactionId: TX1, categoryId: CAT1 }]);
    expect(result.skipped).toEqual([
      { transactionId: TX2, reason: CATEGORIZATION_SKIP_REASON.transfer },
      { transactionId: TX3, reason: CATEGORIZATION_SKIP_REASON.unclear },
      { transactionId: TX4, reason: CATEGORIZATION_SKIP_REASON.no_fit },
    ]);
  });

  it.each([
    ['a bare skip without a code', `${TX1}:skip`],
    ['an unknown skip code', `${TX1}:skip:because-i-said-so`],
  ])('maps %s to the unspecified reason', (_label, response) => {
    const result = parseCategorizationResponse({ response, validCategoryIds, validTransactionIds });

    expect(result.skipped).toEqual([{ transactionId: TX1, reason: CATEGORIZATION_SKIP_REASON.unspecified }]);
  });

  it('accepts skip verdicts regardless of casing', () => {
    const result = parseCategorizationResponse({
      response: `${TX1}:Skip:Transfer`,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result.skipped).toEqual([{ transactionId: TX1, reason: CATEGORIZATION_SKIP_REASON.transfer }]);
  });

  it('ignores skip verdicts for unknown transaction IDs', () => {
    const unknownTx = generateRandomRecordId();
    const result = parseCategorizationResponse({
      response: `${unknownTx}:skip:transfer`,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result).toEqual({ categorized: [], skipped: noSkips });
  });

  it('skips comment lines starting with #', () => {
    const result = parseCategorizationResponse({
      response: `# This is a comment\n${TX1}:${CAT1}\n# Another comment\n${TX2}:${CAT2}`,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result.categorized).toEqual([
      { transactionId: TX1, categoryId: CAT1 },
      { transactionId: TX2, categoryId: CAT2 },
    ]);
  });

  it('skips empty lines and lines with invalid format', () => {
    const result = parseCategorizationResponse({
      response: `${TX1}:${CAT1}\n\ninvalid line\n${TX2}:${CAT2}\n100-3\n${TX3}:`,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result.categorized).toEqual([
      { transactionId: TX1, categoryId: CAT1 },
      { transactionId: TX2, categoryId: CAT2 },
    ]);
    expect(result.skipped).toEqual(noSkips);
  });

  it('filters out unknown transaction IDs and invalid category IDs', () => {
    const unknownTx = generateRandomRecordId();
    const unknownCat = generateRandomRecordId();
    const result = parseCategorizationResponse({
      response: `${TX1}:${CAT1}\n${unknownTx}:${CAT2}\n${TX2}:${unknownCat}\n${TX3}:${CAT3}`,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result.categorized).toEqual([
      { transactionId: TX1, categoryId: CAT1 },
      { transactionId: TX3, categoryId: CAT3 },
    ]);
    expect(result.skipped).toEqual(noSkips);
  });

  it.each([
    ['an empty response', ''],
    ['whitespace only', '   \n\n   '],
    ['comments only', '# Comment 1\n# Comment 2'],
    ['a prose refusal', "I'm unable to categorize any of these transactions with confidence."],
  ])('returns nothing for %s', (_label, response) => {
    expect(parseCategorizationResponse({ response, validCategoryIds, validTransactionIds })).toEqual({
      categorized: [],
      skipped: noSkips,
    });
  });

  it('trims whitespace from lines', () => {
    const result = parseCategorizationResponse({
      response: `  ${TX1}:${CAT1}\n   ${TX2}:skip:transfer   `,
      validCategoryIds,
      validTransactionIds,
    });

    expect(result.categorized).toEqual([{ transactionId: TX1, categoryId: CAT1 }]);
    expect(result.skipped).toEqual([{ transactionId: TX2, reason: CATEGORIZATION_SKIP_REASON.transfer }]);
  });

  it('rejects lines with extra content after valid format (no extra spaces in UUID format)', () => {
    const result = parseCategorizationResponse({
      response: `${TX1}:${CAT1} extra stuff\n${TX2}:${CAT2}`,
      validCategoryIds,
      validTransactionIds,
    });

    // The extra content after trim would make it not match valid IDs
    expect(result.categorized).toEqual([{ transactionId: TX2, categoryId: CAT2 }]);
  });

  it('parses short alias ids (the format prompts actually use)', () => {
    const result = parseCategorizationResponse({
      response: 't1:c2\nt2:skip:transfer',
      validCategoryIds: new Set(['c1', 'c2']),
      validTransactionIds: new Set(['t1', 't2']),
    });

    expect(result.categorized).toEqual([{ transactionId: 't1', categoryId: 'c2' }]);
    expect(result.skipped).toEqual([{ transactionId: 't2', reason: CATEGORIZATION_SKIP_REASON.transfer }]);
  });

  it('recovers verdicts drifting from the exact format: casing, markdown, bullets, bare numbers', () => {
    const result = parseCategorizationResponse({
      response: 'T1:C2\n**t2:c1**\n- t3:c2\n4:1\n`t5:skip:transfer`',
      validCategoryIds: new Set(['c1', 'c2']),
      validTransactionIds: new Set(['t1', 't2', 't3', 't4', 't5']),
    });

    expect(result.categorized).toEqual([
      { transactionId: 't1', categoryId: 'c2' },
      { transactionId: 't2', categoryId: 'c1' },
      { transactionId: 't3', categoryId: 'c2' },
      { transactionId: 't4', categoryId: 'c1' },
    ]);
    expect(result.skipped).toEqual([{ transactionId: 't5', reason: CATEGORIZATION_SKIP_REASON.transfer }]);
  });
});
