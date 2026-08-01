import { AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { createFirstEndpoint, getTestUserId, seedApiKey, setAiFeatureConfig } from '@tests/helpers/user-settings';
import { CUSTOM_ENDPOINT_MODEL } from '@tests/mocks/openai-compatible/mock-api';

/**
 * What the estimate route reports for the model that will answer. The estimate itself
 * makes no AI call, so every case here is decided purely by the resolution ladder.
 */

const CUSTOM_MODEL_ID = `custom/${CUSTOM_ENDPOINT_MODEL}`;

/** Catalog default for statement parsing, so a seeded Google key is enough to reach it. */
const CATALOG_MODEL_ID = 'google/gemini-3.6-flash';

/** Server keys let the ladder answer without user credentials, so every case starts without them. */
const SERVER_KEY_ENV_VARS = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY'] as const;

const STATEMENT_CSV = [
  'date;description;amount',
  '2026-06-01;Grocery store;-42.10',
  '2026-06-02;Salary;2500.00',
  '2026-06-03;Coffee;-4.50',
].join('\n');

function statementBase64(): string {
  return Buffer.from(STATEMENT_CSV, 'utf-8').toString('base64');
}

describe('Statement parser cost estimation', () => {
  let selfHostFlagBeforeTest: string | undefined;
  const serverKeysBeforeTest = new Map<string, string | undefined>();

  beforeEach(() => {
    selfHostFlagBeforeTest = process.env.IS_SELF_HOST;

    // The mock endpoint lives on a host that never resolves, so the outbound guard
    // has to be out of the picture for the endpoint to be saveable.
    process.env.IS_SELF_HOST = 'true';

    for (const envVar of SERVER_KEY_ENV_VARS) {
      serverKeysBeforeTest.set(envVar, process.env[envVar]);
      delete process.env[envVar];
    }
  });

  afterEach(() => {
    if (selfHostFlagBeforeTest === undefined) {
      delete process.env.IS_SELF_HOST;
    } else {
      process.env.IS_SELF_HOST = selfHostFlagBeforeTest;
    }

    for (const envVar of SERVER_KEY_ENV_VARS) {
      const keyBeforeTest = serverKeysBeforeTest.get(envVar);

      if (keyBeforeTest === undefined) {
        delete process.env[envVar];
      } else {
        process.env[envVar] = keyBeforeTest;
      }
    }
  });

  it('estimates against the custom model the feature is configured with', async () => {
    const endpoint = await createFirstEndpoint();
    await setAiFeatureConfig({
      feature: AI_FEATURE.statementParsing,
      modelId: CUSTOM_MODEL_ID,
      customEndpointId: endpoint.id,
      raw: true,
    });

    const estimate = await helpers.statementEstimateCost({ payload: { fileBase64: statementBase64() }, raw: true });

    expect(estimate.modelId).toBe(CUSTOM_MODEL_ID);
    expect(estimate.modelName).toBe(CUSTOM_ENDPOINT_MODEL);
    expect(estimate.usingUserKey).toBe(true);
    expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
    expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);

    // Whoever runs the endpoint sets the price and the context window, so neither is knowable here
    expect(estimate.estimatedCostUsd).toBeNull();
    expect(estimate.tokenLimit).toBeUndefined();
  });

  it('estimates against the fallback custom endpoint when the feature has no config', async () => {
    await createFirstEndpoint();

    const estimate = await helpers.statementEstimateCost({ payload: { fileBase64: statementBase64() }, raw: true });

    expect(estimate.modelId).toBe(CUSTOM_MODEL_ID);
    expect(estimate.modelName).toBe(CUSTOM_ENDPOINT_MODEL);
    expect(estimate.estimatedCostUsd).toBeNull();
  });

  it('prices a catalog model from the catalog', async () => {
    const userId = await getTestUserId();
    await seedApiKey({ userId, provider: AI_PROVIDER.google });

    const estimate = await helpers.statementEstimateCost({ payload: { fileBase64: statementBase64() }, raw: true });

    expect(estimate.modelId).toBe(CATALOG_MODEL_ID);
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
    expect(estimate.tokenLimit?.maxInputTokens).toBeGreaterThan(0);
    expect(estimate.tokenLimit?.exceedsLimit).toBe(false);
  });
});
