import type { ExternalMonobankTransactionResponse } from '@bt/shared/types';
import { HttpResponse, http } from 'msw';

import { getMockedClientData } from './data';

export const VALID_MONOBANK_TOKEN = 'adsfad1234asd2';
export const INVALID_MONOBANK_TOKEN = '1212121212112';
export const MONOBANK_URLS_MOCK = Object.freeze({
  personalStatement: /personal\/statement/,
  clientInfo: /personal\/client-info/,
});

export const getMonobankTransactionsMock = ({
  response = [],
  accountId,
  respectDateRange = false,
}: {
  response?: ExternalMonobankTransactionResponse[];
  accountId?: string | number;
  /**
   * Filter the response by the `{from}/{to}` unix-second segments of the
   * statement URL, like the real API. Off by default: most tests want a fixed
   * payload regardless of the requested window.
   */
  respectDateRange?: boolean;
} = {}) => {
  const urlPattern = accountId
    ? new RegExp(`${MONOBANK_URLS_MOCK.personalStatement.source}/${accountId}`)
    : MONOBANK_URLS_MOCK.personalStatement;

  return http.get(urlPattern, ({ request }) => {
    if (!respectDateRange) {
      return HttpResponse.json(response);
    }

    // URL shape: .../personal/statement/{account}/{from}/{to}
    const segments = new URL(request.url).pathname.split('/').filter(Boolean);
    const from = Number(segments.at(-2));
    const to = Number(segments.at(-1));

    return HttpResponse.json(response.filter((tx) => tx.time >= from && tx.time <= to));
  });
};

export const monobankHandlers = [
  http.get(MONOBANK_URLS_MOCK.clientInfo, ({ request }) => {
    const token = request.headers.get('X-Token');

    if (token === INVALID_MONOBANK_TOKEN) {
      // Matches Monobank's real 403 response body for an unknown API token.
      return HttpResponse.json({ errorDescription: "Unknown 'X-Token'" }, { status: 403 });
    }

    return HttpResponse.json(getMockedClientData());
  }),
];
