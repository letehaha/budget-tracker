import { beforeEach, describe, expect, it, jest } from '@jest/globals';
// `@root/redis-client` is stubbed globally in setupUnitTests.ts.
import { redisClient } from '@root/redis-client';

import {
  type CategorizationTerminalOutcome,
  buildTerminalOutcomeKey,
  consumeTerminalOutcome,
  writeTerminalOutcome,
} from './categorization-terminal-outcome';

type AsyncMock = jest.Mock<(...args: never[]) => Promise<unknown>>;

const redisGetMock = jest.mocked(redisClient.get) as unknown as AsyncMock;
const redisSetMock = jest.mocked(redisClient.set) as unknown as AsyncMock;
const redisDelMock = jest.mocked(redisClient.del) as unknown as AsyncMock;

const USER_ID = 42;
const KEY = buildTerminalOutcomeKey({ userId: USER_ID });

const OUTCOME: CategorizationTerminalOutcome = {
  status: 'completed',
  processedCount: 3,
  totalCount: 3,
  failedCount: 3,
  errorMessage: 'Your custom AI endpoint did not respond.',
};

describe('categorization terminal outcome record', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue('OK');
    redisDelMock.mockResolvedValue(1);
  });

  it('writes the record under the per-user key with a TTL', async () => {
    await writeTerminalOutcome({ userId: USER_ID, outcome: OUTCOME });

    expect(redisSetMock).toHaveBeenCalledWith(KEY, JSON.stringify(OUTCOME), 'EX', 3600);
  });

  it('swallows a failed write — losing the record must not fail the run that produced it', async () => {
    redisSetMock.mockRejectedValue(new Error('redis down'));

    await expect(writeTerminalOutcome({ userId: USER_ID, outcome: OUTCOME })).resolves.toBeUndefined();
  });

  it('consume returns the record and deletes it, so it is served exactly once', async () => {
    redisGetMock.mockResolvedValue(JSON.stringify(OUTCOME));

    await expect(consumeTerminalOutcome({ userId: USER_ID })).resolves.toEqual(OUTCOME);
    expect(redisDelMock).toHaveBeenCalledWith(KEY);
  });

  it('consume returns null when nothing was recorded, without a delete round-trip', async () => {
    await expect(consumeTerminalOutcome({ userId: USER_ID })).resolves.toBeNull();
    expect(redisDelMock).not.toHaveBeenCalled();
  });

  it('consume returns null for a malformed record instead of throwing', async () => {
    redisGetMock.mockResolvedValue('not-json{');

    await expect(consumeTerminalOutcome({ userId: USER_ID })).resolves.toBeNull();
    // Still deleted: a record that cannot be read must not wedge the key forever
    expect(redisDelMock).toHaveBeenCalledWith(KEY);
  });
});
