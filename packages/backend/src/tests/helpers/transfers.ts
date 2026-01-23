import { TRANSACTION_TYPES, TransactionModel } from '@bt/shared/types';
import * as helpers from '@tests/helpers';

import { MakeRequestReturn } from './common';

interface GetTransferRecommendationsParams {
  transactionId?: number;
  transactionType?: TRANSACTION_TYPES;
  originAmount?: number;
  accountId?: number;
}

export function getTransferRecommendations<R extends boolean | undefined = undefined>({
  raw,
  ...params
}: GetTransferRecommendationsParams & { raw?: R }): Promise<MakeRequestReturn<TransactionModel[], R>> {
  return helpers.makeRequest<TransactionModel[], R>({
    method: 'get',
    url: '/transactions/transfer-recommendations',
    payload: params,
    raw,
  });
}
