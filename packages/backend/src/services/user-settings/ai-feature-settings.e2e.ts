import { AIFeatureConfig, AI_FEATURE, API_ERROR_CODES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import UserSettings, { DEFAULT_SETTINGS } from '@models/user-settings.model';
import { RateLimitService } from '@services/common/rate-limit.service';
import * as helpers from '@tests/helpers';
import { useSelfHostWithoutServerAiKeys } from '@tests/helpers/ai-test-env';
import { makeRequest } from '@tests/helpers/common';
import {
  createFirstEndpoint,
  errorMessage,
  getTestUserId,
  readStoredFeatureConfigs,
} from '@tests/helpers/user-settings';
import {
  CUSTOM_ENDPOINT_BASE_URL,
  CUSTOM_ENDPOINT_LISTED_MODELS,
  CUSTOM_ENDPOINT_LISTING_BASE_URL,
  CUSTOM_ENDPOINT_MODEL,
  CUSTOM_ENDPOINT_UNKNOWN_MODEL,
  getCustomEndpointCallCountingMock,
  getCustomEndpointOfflineMock,
} from '@tests/mocks/openai-compatible/mock-api';

// Anthropic-retired alias – stored value would 404 at call time until upgraded.
const RETIRED_MODEL_ID = 'anthropic/claude-3-5-haiku-latest';
const LIVE_REPLACEMENT_ID = 'anthropic/claude-haiku-4-5';

async function seedFeatureConfigs({
  userId,
  configs,
}: {
  userId: number;
  configs: { feature: AI_FEATURE; modelId: string }[];
}): Promise<void> {
  const [settings] = await UserSettings.findOrCreate({
    where: { userId },
    defaults: { settings: DEFAULT_SETTINGS },
  });

  settings.settings = {
    ...settings.settings,
    ai: {
      ...(settings.settings.ai ?? { apiKeys: [], featureConfigs: [] }),
      featureConfigs: configs,
    },
  };

  await settings.save();
}

async function readStoredConfig({
  userId,
  feature,
}: {
  userId: number;
  feature: AI_FEATURE;
}): Promise<AIFeatureConfig | null> {
  return (await readStoredFeatureConfigs({ userId })).find((config) => config.feature === feature) ?? null;
}

async function readStoredModelId({ userId, feature }: { userId: number; feature: AI_FEATURE }): Promise<string | null> {
  return (await readStoredConfig({ userId, feature }))?.modelId ?? null;
}

/** An endpoint that publishes a `/models` catalogue, so the list decides the verdict. */
async function createListingEndpoint() {
  return helpers.createAiCustomEndpoint({
    name: 'Listing LLM',
    baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
    defaultModel: CUSTOM_ENDPOINT_MODEL,
    raw: true,
  });
}

/** Saving an endpoint probes it too, so the budget is cleared once the setup is done. */
async function resetProbeBudget({ userId }: { userId: number }) {
  await RateLimitService.resetRateLimit(`ai-custom-endpoint-test:user:${userId}`);
}

describe('AI feature settings – lazy upgrade of retired model IDs', () => {
  useSelfHostWithoutServerAiKeys();

  describe('GET /user/settings/ai/features', () => {
    it('rewrites a retired model in the response and persists the upgrade', async () => {
      const userId = await getTestUserId();
      await seedFeatureConfigs({
        userId,
        configs: [
          { feature: AI_FEATURE.categorization, modelId: RETIRED_MODEL_ID },
          {
            feature: AI_FEATURE.statementParsing,
            modelId: LIVE_REPLACEMENT_ID,
          },
        ],
      });

      const response = await makeRequest<{ features: Array<{ feature: AI_FEATURE; modelId: string }> }, true>({
        method: 'get',
        url: '/user/settings/ai/features',
        raw: true,
      });

      const categorization = response.features.find((f) => f.feature === AI_FEATURE.categorization);
      expect(categorization?.modelId).toBe(LIVE_REPLACEMENT_ID);

      expect(await readStoredModelId({ userId, feature: AI_FEATURE.categorization })).toBe(LIVE_REPLACEMENT_ID);
      expect(
        await readStoredModelId({
          userId,
          feature: AI_FEATURE.statementParsing,
        }),
      ).toBe(LIVE_REPLACEMENT_ID);
    });
  });

  describe('GET /user/settings/ai/features/:feature', () => {
    it('rewrites a retired model in the response and persists the upgrade', async () => {
      const userId = await getTestUserId();
      await seedFeatureConfigs({
        userId,
        configs: [{ feature: AI_FEATURE.statementParsing, modelId: RETIRED_MODEL_ID }],
      });

      const response = await makeRequest<{ modelId: string; isConfigured: boolean }, true>({
        method: 'get',
        url: `/user/settings/ai/features/${AI_FEATURE.statementParsing}`,
        raw: true,
      });

      expect(response.modelId).toBe(LIVE_REPLACEMENT_ID);
      expect(response.isConfigured).toBe(true);

      const persisted = await readStoredModelId({
        userId,
        feature: AI_FEATURE.statementParsing,
      });
      expect(persisted).toBe(LIVE_REPLACEMENT_ID);
    });
  });

  describe('PUT /user/settings/ai/features/:feature', () => {
    it('accepts a retired model ID and silently upgrades it, but rejects a fully unknown one', async () => {
      const userId = await getTestUserId();

      const response = await makeRequest<{ modelId: string; isConfigured: boolean }, true>({
        method: 'put',
        url: `/user/settings/ai/features/${AI_FEATURE.categorization}`,
        payload: { modelId: RETIRED_MODEL_ID },
        raw: true,
      });

      expect(response.modelId).toBe(LIVE_REPLACEMENT_ID);
      expect(response.isConfigured).toBe(true);
      expect(await readStoredModelId({ userId, feature: AI_FEATURE.categorization })).toBe(LIVE_REPLACEMENT_ID);

      const rejected = await makeRequest({
        method: 'put',
        url: `/user/settings/ai/features/${AI_FEATURE.categorization}`,
        payload: { modelId: 'anthropic/this-model-never-existed' },
      });

      expect(rejected.statusCode).toBe(422);
      expect(await readStoredModelId({ userId, feature: AI_FEATURE.categorization })).toBe(LIVE_REPLACEMENT_ID);
    });
  });
});

describe('PUT /user/settings/ai/features/:feature – custom model probe', () => {
  const SERVED_MODEL_ID = `custom/${CUSTOM_ENDPOINT_MODEL}`;
  const UNSERVED_MODEL_ID = `custom/${CUSTOM_ENDPOINT_UNKNOWN_MODEL}`;

  useSelfHostWithoutServerAiKeys();

  it('rejects an unserved model and one on an unreachable endpoint, keeping the stored config', async () => {
    const userId = await getTestUserId();
    const endpoint = await createFirstEndpoint();
    await helpers.setAiFeatureConfig({
      feature: AI_FEATURE.categorization,
      modelId: LIVE_REPLACEMENT_ID,
    });

    const unserved = await helpers.setAiFeatureConfig({
      feature: AI_FEATURE.categorization,
      modelId: UNSERVED_MODEL_ID,
      customEndpointId: endpoint.id,
    });

    expect(unserved.statusCode).toBe(422);
    expect(errorMessage({ response: unserved })).toContain(CUSTOM_ENDPOINT_UNKNOWN_MODEL);

    expect(await readStoredConfig({ userId, feature: AI_FEATURE.categorization })).toEqual({
      feature: AI_FEATURE.categorization,
      modelId: LIVE_REPLACEMENT_ID,
    });

    // The endpoint answered while it was being saved; it goes down only now
    global.mswMockServer.use(getCustomEndpointOfflineMock({ baseUrl: CUSTOM_ENDPOINT_BASE_URL }));

    const unreachable = await helpers.setAiFeatureConfig({
      feature: AI_FEATURE.categorization,
      modelId: SERVED_MODEL_ID,
      customEndpointId: endpoint.id,
    });

    expect(unreachable.statusCode).toBe(422);

    const unreachableMessage = errorMessage({ response: unreachable });
    expect(unreachableMessage).toEqual(expect.any(String));
    expect(unreachableMessage).not.toContain(CUSTOM_ENDPOINT_MODEL);

    expect(await readStoredConfig({ userId, feature: AI_FEATURE.categorization })).toEqual({
      feature: AI_FEATURE.categorization,
      modelId: LIVE_REPLACEMENT_ID,
    });
  }, 30_000);

  it('rejects a model missing from the endpoint model list and saves a listed one', async () => {
    const userId = await getTestUserId();
    const endpoint = await createListingEndpoint();
    await helpers.setAiFeatureConfig({
      feature: AI_FEATURE.categorization,
      modelId: LIVE_REPLACEMENT_ID,
    });

    const response = await helpers.setAiFeatureConfig({
      feature: AI_FEATURE.categorization,
      modelId: `custom/${CUSTOM_ENDPOINT_UNKNOWN_MODEL}`,
      customEndpointId: endpoint.id,
    });

    expect(response.statusCode).toBe(422);
    expect(errorMessage({ response })).toContain(CUSTOM_ENDPOINT_UNKNOWN_MODEL);
    expect(errorMessage({ response })).toContain(CUSTOM_ENDPOINT_LISTED_MODELS[0]);

    expect(await readStoredConfig({ userId, feature: AI_FEATURE.categorization })).toEqual({
      feature: AI_FEATURE.categorization,
      modelId: LIVE_REPLACEMENT_ID,
    });

    let endpointCalls = 0;
    global.mswMockServer.use(
      getCustomEndpointCallCountingMock({
        baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
        onCall: () => {
          endpointCalls += 1;
        },
      }),
    );

    const config = await helpers.setAiFeatureConfig({
      feature: AI_FEATURE.categorization,
      modelId: SERVED_MODEL_ID,
      customEndpointId: endpoint.id,
      raw: true,
    });

    expect(config.modelId).toBe(SERVED_MODEL_ID);
    expect(endpointCalls).toBe(0);

    expect(await readStoredConfig({ userId, feature: AI_FEATURE.categorization })).toEqual({
      feature: AI_FEATURE.categorization,
      modelId: SERVED_MODEL_ID,
      customEndpointId: endpoint.id,
    });
  });

  it('makes no outbound call for a catalog model, then saves a custom model the endpoint serves', async () => {
    const userId = await getTestUserId();
    const endpoint = await createFirstEndpoint();

    let endpointCalls = 0;
    global.mswMockServer.use(
      getCustomEndpointCallCountingMock({
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        onCall: () => {
          endpointCalls += 1;
        },
      }),
    );

    const catalogConfig = await helpers.setAiFeatureConfig({
      feature: AI_FEATURE.categorization,
      modelId: LIVE_REPLACEMENT_ID,
      raw: true,
    });

    expect(catalogConfig.isConfigured).toBe(true);
    expect(endpointCalls).toBe(0);

    expect(await readStoredConfig({ userId, feature: AI_FEATURE.categorization })).toEqual({
      feature: AI_FEATURE.categorization,
      modelId: LIVE_REPLACEMENT_ID,
    });

    const customConfig = await helpers.setAiFeatureConfig({
      feature: AI_FEATURE.categorization,
      modelId: SERVED_MODEL_ID,
      customEndpointId: endpoint.id,
      raw: true,
    });

    expect(customConfig.modelId).toBe(SERVED_MODEL_ID);
    expect(customConfig.customEndpointId).toBe(endpoint.id);
    expect(customConfig.isConfigured).toBe(true);

    expect(await readStoredConfig({ userId, feature: AI_FEATURE.categorization })).toEqual({
      feature: AI_FEATURE.categorization,
      modelId: SERVED_MODEL_ID,
      customEndpointId: endpoint.id,
    });
  });

  describe('Outbound probe rate limit', () => {
    it('counts a custom model against the same budget as a connection test', async () => {
      const userId = await getTestUserId();
      const endpoint = await createFirstEndpoint();
      await resetProbeBudget({ userId });

      for (let attempt = 1; attempt <= 15; attempt++) {
        const probe = await helpers.testAiCustomEndpoint({
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
          defaultModel: CUSTOM_ENDPOINT_MODEL,
        });
        expect(probe.statusCode).toBe(200);
      }

      const blocked = await helpers.setAiFeatureConfig({
        feature: AI_FEATURE.categorization,
        modelId: SERVED_MODEL_ID,
        customEndpointId: endpoint.id,
      });

      expect(blocked.statusCode).toBe(429);
      const errorBody = blocked.body as unknown as {
        response?: { code?: string };
      };
      expect(errorBody.response?.code).toBe(API_ERROR_CODES.tooManyRequests);

      expect(await readStoredConfig({ userId, feature: AI_FEATURE.categorization })).toBeNull();
    }, 30_000);

    it('leaves the budget untouched for catalog models', async () => {
      const userId = await getTestUserId();
      await resetProbeBudget({ userId });

      for (let attempt = 1; attempt <= 5; attempt++) {
        const saved = await helpers.setAiFeatureConfig({
          feature: AI_FEATURE.categorization,
          modelId: LIVE_REPLACEMENT_ID,
        });
        expect(saved.statusCode).toBe(200);
      }

      // A consumed budget would start refusing these before the 15th
      for (let attempt = 1; attempt <= 15; attempt++) {
        const probe = await helpers.testAiCustomEndpoint({
          baseUrl: CUSTOM_ENDPOINT_BASE_URL,
          defaultModel: CUSTOM_ENDPOINT_MODEL,
        });
        expect(probe.statusCode).toBe(200);
      }
    }, 30_000);
  });
});
