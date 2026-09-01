import { AI_PROVIDER } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { INVALID_OPENROUTER_API_KEY, VALID_OPENROUTER_API_KEY } from '@tests/mocks/openrouter/mock-api';

describe('OpenRouter API key settings', () => {
  it('returns an empty state before a key is configured', async () => {
    const status = await helpers.getAiApiKeyStatus({ raw: true });

    expect(status).toEqual({ hasApiKey: false, providers: [] });
  });

  it('validates, stores, lists, and deletes an OpenRouter key', async () => {
    const saved = await helpers.setAiApiKey({
      provider: AI_PROVIDER.openrouter,
      apiKey: VALID_OPENROUTER_API_KEY,
    });
    expect(saved.statusCode).toBe(200);

    const status = await helpers.getAiApiKeyStatus({ raw: true });
    expect(status.hasApiKey).toBe(true);
    expect(status.defaultProvider).toBe(AI_PROVIDER.openrouter);
    expect(status.providers).toEqual([expect.objectContaining({ provider: AI_PROVIDER.openrouter })]);

    const models = await helpers.makeRequest<{ models: Array<{ provider: AI_PROVIDER }> }, true>({
      method: 'get',
      url: `/user/settings/ai/models?provider=${AI_PROVIDER.openrouter}`,
      raw: true,
    });
    expect(models.models).toHaveLength(4);
    expect(models.models.every((model) => model.provider === AI_PROVIDER.openrouter)).toBe(true);

    const deleted = await helpers.deleteAiApiKey({ provider: AI_PROVIDER.openrouter });
    expect(deleted.statusCode).toBe(200);
    expect(await helpers.getAiApiKeyStatus({ raw: true })).toEqual({ hasApiKey: false, providers: [] });
  });

  it('rejects an invalid OpenRouter key without storing it', async () => {
    const response = await helpers.setAiApiKey({
      provider: AI_PROVIDER.openrouter,
      apiKey: INVALID_OPENROUTER_API_KEY,
    });

    expect(response.statusCode).toBe(422);
    expect(await helpers.getAiApiKeyStatus({ raw: true })).toEqual({ hasApiKey: false, providers: [] });
  });
});
