import type { SimplefinAccountSet, SimplefinTransaction } from '@services/bank-data-providers/simplefin/types';
import { HttpResponse, http } from 'msw';

import { getMockedSimplefinAccountSet } from './data';

const SIMPLEFIN_HOST = 'beta-bridge.simplefin.org';
const SIMPLEFIN_BASE_URL = `https://${SIMPLEFIN_HOST}/simplefin`;

/** The `/accounts` endpoint URL — exported so tests can register handlers. */
export const SIMPLEFIN_ACCOUNTS_URL = `${SIMPLEFIN_BASE_URL}/accounts`;

// Credentials the claim endpoint hands back, embedded in the Access URL.
const ACCESS_USER = 'access-user';
const ACCESS_PASS = 'access-pass';
export const SIMPLEFIN_ACCESS_URL = `https://${ACCESS_USER}:${ACCESS_PASS}@${SIMPLEFIN_HOST}/simplefin`;

const EXPECTED_AUTH_HEADER = `Basic ${Buffer.from(`${ACCESS_USER}:${ACCESS_PASS}`).toString('base64')}`;

const isAuthorized = (request: Request): boolean => request.headers.get('authorization') === EXPECTED_AUTH_HEADER;

// Setup tokens are base64-encoded claim URLs. The token's path segment selects
// the claim outcome (see the claim handler below).
const claimUrl = (token: string): string => `${SIMPLEFIN_BASE_URL}/claim/${token}`;
const setupToken = (token: string): string => Buffer.from(claimUrl(token)).toString('base64');

export const VALID_SIMPLEFIN_SETUP_TOKEN = setupToken('DEMO');
export const INVALID_SIMPLEFIN_SETUP_TOKEN = setupToken('INVALID');
/** Claim endpoint returns 429 (rate limited) — token itself is fine. */
export const RATE_LIMITED_SIMPLEFIN_SETUP_TOKEN = setupToken('RATELIMIT');
/** Claim endpoint returns 500 (provider outage). */
export const SERVER_ERROR_SIMPLEFIN_SETUP_TOKEN = setupToken('SERVERERROR');
/** Base64 that decodes to a non-URL — rejected before any HTTP call. */
export const NON_URL_SIMPLEFIN_SETUP_TOKEN = Buffer.from('not-a-url').toString('base64');

/** Per-test override for the `/accounts` response (auth-checked). */
export const getSimplefinAccountsMock = ({ response }: { response: SimplefinAccountSet }) =>
  http.get(SIMPLEFIN_ACCOUNTS_URL, ({ request }) => {
    if (!isAuthorized(request)) {
      return new HttpResponse(null, { status: 403, statusText: 'Forbidden' });
    }
    return HttpResponse.json(response);
  });

/** Force the `/accounts` endpoint to fail with a given HTTP status. */
export const getSimplefinAccountsErrorMock = ({ status }: { status: number }) =>
  http.get(SIMPLEFIN_ACCOUNTS_URL, () => new HttpResponse(null, { status, statusText: 'Error' }));

/**
 * An `/accounts` handler that records every request URL it sees (for asserting
 * `version=2` and the windows requested) and, when `windowed`, filters the
 * embedded transactions to the requested `start-date`..`end-date` range
 * (start inclusive, end exclusive — matching the protocol) so multi-window
 * paging can be exercised end-to-end.
 */
export const createSimplefinAccountsRecorder = ({
  account1Transactions = [],
  windowed = false,
}: {
  account1Transactions?: SimplefinTransaction[];
  windowed?: boolean;
} = {}): { handler: ReturnType<typeof http.get>; requests: URL[] } => {
  const requests: URL[] = [];

  const handler = http.get(SIMPLEFIN_ACCOUNTS_URL, ({ request }) => {
    const url = new URL(request.url);
    requests.push(url);

    if (!isAuthorized(request)) {
      return new HttpResponse(null, { status: 403, statusText: 'Forbidden' });
    }

    let transactions = account1Transactions;
    if (windowed) {
      const startParam = url.searchParams.get('start-date');
      const endParam = url.searchParams.get('end-date');
      const startSec = startParam ? Number(startParam) : Number.NEGATIVE_INFINITY;
      const endSec = endParam ? Number(endParam) : Number.POSITIVE_INFINITY;
      transactions = account1Transactions.filter((tx) => tx.posted >= startSec && tx.posted < endSec);
    }

    return HttpResponse.json(getMockedSimplefinAccountSet({ account1Transactions: transactions }));
  });

  return { handler, requests };
};

export const simplefinHandlers = [
  // POST /claim/:token — exchange a setup token for an Access URL (text body).
  // The token segment selects the outcome so tests can drive every branch.
  http.post(`${SIMPLEFIN_BASE_URL}/claim/:token`, ({ params }) => {
    switch (params.token) {
      case 'DEMO':
        return new HttpResponse(SIMPLEFIN_ACCESS_URL, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      case 'RATELIMIT':
        return new HttpResponse(null, { status: 429, statusText: 'Too Many Requests' });
      case 'SERVERERROR':
        return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' });
      // "INVALID" and anything else: used/expired/nonexistent token.
      default:
        return new HttpResponse(null, { status: 403, statusText: 'Forbidden' });
    }
  }),

  // GET /accounts — Basic-auth protected AccountSet. Defaults to two accounts
  // with no transactions; tests override via getSimplefinAccountsMock().
  http.get(SIMPLEFIN_ACCOUNTS_URL, ({ request }) => {
    if (!isAuthorized(request)) {
      return new HttpResponse(null, { status: 403, statusText: 'Forbidden' });
    }
    return HttpResponse.json(getMockedSimplefinAccountSet());
  }),
];
