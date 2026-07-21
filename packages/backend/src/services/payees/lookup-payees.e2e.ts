import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('GET /payees/lookup (getPayeesLookup)', () => {
  it('returns all payees as a minimal {id, name, logoDomain} projection with no stats', async () => {
    const withLogo = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: 'Aaa Lookup', logoDomain: 'stripe.com' }),
      raw: true,
    });
    const explicitNoLogo = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: 'Bbb Lookup', logoDomain: null }),
      raw: true,
    });
    const defaultLogo = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: 'Ccc Lookup' }),
      raw: true,
    });

    const lookup = await helpers.lookupPayees({ raw: true });

    // Fresh user, so lookup returns exactly the three created payees, ordered by name.
    expect(lookup.map((p) => p.name)).toEqual(['Aaa Lookup', 'Bbb Lookup', 'Ccc Lookup']);

    for (const item of lookup) {
      expect(Object.keys(item).toSorted()).toEqual(['id', 'logoDomain', 'name']);
      expect(item).not.toHaveProperty('stats');
    }

    expect(lookup.find((p) => p.id === withLogo.id)?.logoDomain).toBe('stripe.com');
    expect(lookup.find((p) => p.id === explicitNoLogo.id)?.logoDomain).toBeNull();
    expect(lookup.find((p) => p.id === defaultLogo.id)).toBeDefined();
  });

  it('returns an empty array for a fresh user with no payees', async () => {
    const lookup = await helpers.lookupPayees({ raw: true });
    expect(lookup).toEqual([]);
  });

  it('returns every payee even past the top-50, including a zero-transaction one', async () => {
    // The `/payees` list endpoint defaults to the top-50 by transaction count,
    // so a payee with no transactions ranks last and drops off once the user
    // has more than 50. `/payees/lookup` has no limit and no stats, so it must
    // return the whole set regardless.
    const totalPayees = 55;
    for (let i = 0; i < totalPayees - 1; i++) {
      await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: `Filler ${generateRandomRecordId()}` }),
        raw: true,
      });
    }

    // Created last and never referenced by a transaction — the exact case that
    // would fall outside the top-50 on the stats-sorted list endpoint.
    const zeroTxTarget = await helpers.createPayee({
      payload: helpers.buildPayeePayload({ name: `Target ${generateRandomRecordId()}` }),
      raw: true,
    });

    const lookup = await helpers.lookupPayees({ raw: true });

    expect(lookup).toHaveLength(totalPayees);
    expect(lookup.some((p) => p.id === zeroTxTarget.id)).toBe(true);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const originalCookies = global.APP_AUTH_COOKIES;
    global.APP_AUTH_COOKIES = null;

    try {
      const res = await helpers.lookupPayees({ raw: false });
      expect(res.statusCode).toBe(401);
    } finally {
      global.APP_AUTH_COOKIES = originalCookies;
    }
  });
});
