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
}: { response?: ExternalMonobankTransactionResponse[]; accountId?: string | number } = {}) => {
  return http.get(
    accountId
      ? new RegExp(`${MONOBANK_URLS_MOCK.personalStatement.source}/${accountId}`)
      : MONOBANK_URLS_MOCK.personalStatement,
    () => {
      return HttpResponse.json(response);
    },
  );
};

export const monobankHandlers = [
  http.get(MONOBANK_URLS_MOCK.clientInfo, ({ request }) => {
    const token = request.headers.get('X-Token');

    if (token === INVALID_MONOBANK_TOKEN) {
      return new HttpResponse(null, {
        status: 403,
        statusText: 'Forbidden',
      });
    }

    return HttpResponse.json(getMockedClientData());
  }),
  getMonobankTransactionsMock(),
];
