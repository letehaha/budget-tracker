import type { LoanApiResponse } from '@root/serializers/loans.serializer';

import { makeRequest } from './common';

export async function getLoans<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<LoanApiResponse[], R>({
    method: 'get',
    url: '/loans',
    raw,
  });
}

export async function getLoanById<R extends boolean | undefined = undefined>({ id, raw }: { id: string; raw?: R }) {
  return makeRequest<LoanApiResponse, R>({
    method: 'get',
    url: `/loans/${id}`,
    raw,
  });
}
