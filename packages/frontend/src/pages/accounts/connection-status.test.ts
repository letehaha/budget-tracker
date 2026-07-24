import type { ConnectionStatusSummary } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { deriveConnectionStatus } from './connection-status';

function makeSummary(overrides: Partial<ConnectionStatusSummary> = {}): ConnectionStatusSummary {
  return {
    connectionId: 'conn-1',
    isActive: true,
    consentExpired: false,
    consentExpiringSoon: false,
    daysRemaining: null,
    ...overrides,
  };
}

describe('deriveConnectionStatus', () => {
  it('returns active when there is no summary and no reauth need', () => {
    expect(deriveConnectionStatus({ summary: undefined, needsReauth: false })).toBe('active');
  });

  it('returns active for a healthy summary', () => {
    expect(deriveConnectionStatus({ summary: makeSummary({ daysRemaining: 90 }), needsReauth: false })).toBe('active');
  });

  it('returns expiring-soon when the consent is nearing expiry', () => {
    expect(
      deriveConnectionStatus({
        summary: makeSummary({ consentExpiringSoon: true, daysRemaining: 5 }),
        needsReauth: false,
      }),
    ).toBe('expiring-soon');
  });

  it('returns expired when the consent has expired', () => {
    expect(
      deriveConnectionStatus({
        summary: makeSummary({ consentExpired: true, daysRemaining: 0 }),
        needsReauth: false,
      }),
    ).toBe('expired');
  });

  it('returns reauth when a reconnect is needed and consent is not expired', () => {
    expect(deriveConnectionStatus({ summary: makeSummary(), needsReauth: true })).toBe('reauth');
  });

  it('prioritizes expired over reauth', () => {
    expect(
      deriveConnectionStatus({
        summary: makeSummary({ consentExpired: true, daysRemaining: 0 }),
        needsReauth: true,
      }),
    ).toBe('expired');
  });

  it('prioritizes reauth over expiring-soon', () => {
    expect(
      deriveConnectionStatus({
        summary: makeSummary({ consentExpiringSoon: true, daysRemaining: 3 }),
        needsReauth: true,
      }),
    ).toBe('reauth');
  });
});
