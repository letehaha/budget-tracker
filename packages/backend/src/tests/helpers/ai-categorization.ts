import type { AiCategorizationStatus } from '@bt/shared/types';
import type { getCategorizationStatus } from '@services/ai-categorization/categorization-status.service';

import { makeRequest, sleep } from './common';

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

/**
 * Poll the categorization status endpoint until `predicate` matches.
 * Throws with the last observed status when the timeout elapses.
 */
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
