import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@js/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock('./ai-client-factory', () => ({
  createAIClientWithConfig: jest.fn(() => ({})),
}));
jest.mock('ai', () => ({
  ...(jest.requireActual('ai') as object),
  generateText: jest.fn(),
}));

import { AI_PROVIDER } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { APICallError, generateText } from 'ai';

import { createAIClientWithConfig } from './ai-client-factory';
import { validateApiKey } from './api-key-validation';

const generateTextMock = generateText as unknown as jest.Mock<() => Promise<unknown>>;
const createAIClientWithConfigMock = createAIClientWithConfig as jest.MockedFunction<typeof createAIClientWithConfig>;

// Minimal fields required by the APICallError constructor; url/requestBodyValues
// are irrelevant to the classifier but the SDK type requires them.
function buildApiCallError({ statusCode, isRetryable }: { statusCode?: number; isRetryable?: boolean }): APICallError {
  return new APICallError({
    message: 'api call failed',
    url: 'https://example.com',
    requestBodyValues: {},
    statusCode,
    isRetryable,
  });
}

describe('validateApiKey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns valid when the first validation model answers', async () => {
    generateTextMock.mockResolvedValueOnce({});

    const result = await validateApiKey({ provider: AI_PROVIDER.openai, apiKey: 'sk-test' });

    expect(result).toEqual({ isValid: true });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('validates OpenRouter with its low-cost routed model', async () => {
    generateTextMock.mockResolvedValueOnce({});

    const result = await validateApiKey({ provider: AI_PROVIDER.openrouter, apiKey: 'sk-or-v1-test' });

    expect(result).toEqual({ isValid: true });
    expect(createAIClientWithConfigMock).toHaveBeenCalledWith({
      provider: AI_PROVIDER.openrouter,
      modelId: 'openrouter/openai/gpt-oss-20b',
      apiKey: 'sk-or-v1-test',
    });
  });

  it('falls back to the next model when the first rejects a non-auth 400 (account-gated model)', async () => {
    generateTextMock.mockRejectedValueOnce(buildApiCallError({ statusCode: 400 }));
    generateTextMock.mockResolvedValueOnce({});

    const result = await validateApiKey({ provider: AI_PROVIDER.openai, apiKey: 'sk-test' });

    expect(result).toEqual({ isValid: true });
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('reports invalid at error level only after every model in the chain rejects', async () => {
    generateTextMock.mockRejectedValue(buildApiCallError({ statusCode: 400 }));

    const result = await validateApiKey({ provider: AI_PROVIDER.openai, apiKey: 'sk-test' });

    expect(result.isValid).toBe(false);
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('stops at the first auth error without trying the fallback model, logging at info level', async () => {
    generateTextMock.mockRejectedValueOnce(buildApiCallError({ statusCode: 401 }));

    const result = await validateApiKey({ provider: AI_PROVIDER.openai, apiKey: 'sk-bad' });

    expect(result.isValid).toBe(false);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('treats a rate-limited first model as a valid key', async () => {
    generateTextMock.mockRejectedValueOnce(buildApiCallError({ statusCode: 429 }));

    const result = await validateApiKey({ provider: AI_PROVIDER.openai, apiKey: 'sk-test' });

    expect(result).toEqual({ isValid: true });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });
});
