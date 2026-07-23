import { computeConsentValidity } from './consent-validity';

const NOW = new Date('2026-01-15T00:00:00.000Z');

describe('computeConsentValidity', () => {
  it('returns undefined when metadata has no consentValidUntil', () => {
    expect(computeConsentValidity({ metadata: {}, now: NOW })).toBeUndefined();
    expect(computeConsentValidity({ metadata: null, now: NOW })).toBeUndefined();
    expect(computeConsentValidity({ metadata: { consentValidFrom: '2026-01-01' }, now: NOW })).toBeUndefined();
  });

  it('reports an active consent when more than 7 days remain', () => {
    const result = computeConsentValidity({
      metadata: { consentValidFrom: '2026-01-01T00:00:00.000Z', consentValidUntil: '2026-02-15T00:00:00.000Z' },
      now: NOW,
    });

    expect(result).toEqual({
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2026-02-15T00:00:00.000Z',
      daysRemaining: 31,
      isExpired: false,
      isExpiringSoon: false,
    });
  });

  it('flags isExpiringSoon when exactly 7 days remain', () => {
    const result = computeConsentValidity({
      metadata: { consentValidUntil: '2026-01-22T00:00:00.000Z' },
      now: NOW,
    });

    expect(result).toMatchObject({ daysRemaining: 7, isExpired: false, isExpiringSoon: true });
  });

  it('flags isExpiringSoon when fewer than 7 days remain', () => {
    const result = computeConsentValidity({
      metadata: { consentValidUntil: '2026-01-20T00:00:00.000Z' },
      now: NOW,
    });

    expect(result).toMatchObject({ daysRemaining: 5, isExpired: false, isExpiringSoon: true });
  });

  it('marks a past consent expired with daysRemaining 0', () => {
    const result = computeConsentValidity({
      metadata: { consentValidUntil: '2026-01-01T00:00:00.000Z' },
      now: NOW,
    });

    expect(result).toMatchObject({ daysRemaining: 0, isExpired: true, isExpiringSoon: false });
  });

  it('returns the null branch when consentValidUntil is unparseable', () => {
    const result = computeConsentValidity({
      metadata: { consentValidFrom: '2026-01-01T00:00:00.000Z', consentValidUntil: 'not-a-date' },
      now: NOW,
    });

    expect(result).toEqual({
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null,
      daysRemaining: null,
      isExpired: false,
      isExpiringSoon: false,
    });
  });
});
