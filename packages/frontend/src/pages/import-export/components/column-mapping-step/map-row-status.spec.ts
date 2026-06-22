import { describe, expect, it } from 'vitest';

import { deriveMapRowStatus } from './map-row-status';

describe('deriveMapRowStatus', () => {
  describe('empty fields', () => {
    it('returns needs-attention for a required field with no value', () => {
      expect(deriveMapRowStatus({ hasValue: false, required: true, match: null })).toBe('needs-attention');
    });

    it('returns optional for an optional field with no value', () => {
      expect(deriveMapRowStatus({ hasValue: false, required: false, match: null })).toBe('optional');
    });

    it('ignores the match record when there is no value', () => {
      // A stale match record must not promote an empty required field.
      expect(
        deriveMapRowStatus({ hasValue: false, required: true, match: { column: 'date', confidence: 'exact' } }),
      ).toBe('needs-attention');
    });
  });

  describe('filled fields', () => {
    it('returns auto-matched for an exact match', () => {
      expect(
        deriveMapRowStatus({ hasValue: true, required: true, match: { column: 'date', confidence: 'exact' } }),
      ).toBe('auto-matched');
    });

    it('returns auto-matched for a starts-with match', () => {
      expect(
        deriveMapRowStatus({
          hasValue: true,
          required: true,
          match: { column: 'date_posted', confidence: 'starts-with' },
        }),
      ).toBe('auto-matched');
    });

    it('returns suggested for a low-confidence contains match', () => {
      expect(
        deriveMapRowStatus({
          hasValue: true,
          required: true,
          match: { column: 'tx_date_col', confidence: 'contains' },
        }),
      ).toBe('suggested');
    });

    it('returns auto-matched for a user-picked value with no match record', () => {
      expect(deriveMapRowStatus({ hasValue: true, required: true, match: null })).toBe('auto-matched');
    });

    it('returns auto-matched for a filled optional field', () => {
      expect(deriveMapRowStatus({ hasValue: true, required: false, match: null })).toBe('auto-matched');
    });
  });
});
