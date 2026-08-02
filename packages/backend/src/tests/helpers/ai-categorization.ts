import type {
  AiCategorizationCandidatesResponse,
  AiCategorizationStatus,
  AiCategorizationTriggerResponse,
  SORT_DIRECTIONS,
  TRANSACTION_SORT_FIELD,
} from '@bt/shared/types';
import type { TransactionApiResponse } from '@root/serializers/transactions.serializer';
import type { getCategorizationStatus } from '@services/ai-categorization/categorization-status.service';

import { makeRequest, sleep } from './common';

export async function triggerAiCategorization<R extends boolean | undefined = undefined>({
  raw,
  payload,
}: {
  raw?: R;
  payload?: { transactionIds?: string[] };
} = {}) {
  return makeRequest<AiCategorizationTriggerResponse, R>({
    method: 'post',
    url: '/user/ai/categorization/trigger',
    payload,
    raw,
  });
}

export async function getAiCategorizationCandidates<R extends boolean | undefined = undefined>({
  raw,
  payload,
}: {
  raw?: R;
  payload?: {
    limit?: number;
    offset?: number;
    sortBy?: TRANSACTION_SORT_FIELD;
    order?: SORT_DIRECTIONS;
  };
} = {}) {
  return makeRequest<AiCategorizationCandidatesResponse<TransactionApiResponse>, R>({
    method: 'get',
    url: '/user/ai/categorization/candidates',
    payload,
    raw,
  });
}

export async function getAiCategorizationStatus<R extends boolean | undefined = undefined>({
  raw,
}: {
  raw?: R;
} = {}) {
  return makeRequest<Awaited<ReturnType<typeof getCategorizationStatus>>, R>({
    method: 'get',
    url: '/user/ai/categorization/status',
    raw,
  });
}

export async function waitForCategorizationStatus({
  predicate,
  timeoutMs = 20000,
  pollIntervalMs = 250,
}: {
  predicate: (status: AiCategorizationStatus) => boolean;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<AiCategorizationStatus> {
  const startTime = Date.now();
  let lastStatus: AiCategorizationStatus | undefined;

  while (Date.now() - startTime < timeoutMs) {
    lastStatus = await getAiCategorizationStatus({ raw: true });
    if (predicate(lastStatus)) return lastStatus;
    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Categorization status never matched predicate within ${timeoutMs}ms. Last status: ${JSON.stringify(lastStatus)}`,
  );
}
