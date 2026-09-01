import { AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { useSelfHostWithoutServerAiKeys } from '@tests/helpers/ai-test-env';
import {
  createFirstEndpoint,
  errorMessage,
  getTestUserId,
  readStoredEndpoints,
  seedApiKey,
  setAiFeatureConfig,
} from '@tests/helpers/user-settings';
import { CUSTOM_ENDPOINT_MODEL, getCustomEndpointOfflineMock } from '@tests/mocks/openai-compatible/mock-api';

const CUSTOM_MODEL_ID = `custom/${CUSTOM_ENDPOINT_MODEL}`;

/** Catalog default for investment parsing, so a seeded Google key is enough to reach it. */
const CATALOG_MODEL_ID = 'google/gemini-3.6-flash';

/** Server keys let the ladder answer without user credentials, so every case starts without them. */
const SERVER_KEY_ENV_VARS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
] as const;

const TRADES_CSV = [
  'date,symbol,side,quantity,price',
  '2026-06-01,AAPL,buy,10,187.35',
  '2026-06-02,MSFT,buy,4,412.80',
  '2026-06-03,AAPL,sell,5,191.02',
].join('\n');

function tradesBase64(): string {
  return Buffer.from(TRADES_CSV, 'utf-8').toString('base64');
}

describe('Investment transactions parser cost estimation', () => {
  let selfHostFlagBeforeTest: string | undefined;
  const serverKeysBeforeTest = new Map<string, string | undefined>();

  beforeEach(() => {
    selfHostFlagBeforeTest = process.env.IS_SELF_HOST;

    // The mock endpoint's host never resolves, so the outbound guard has to be off to save it.
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
      feature: AI_FEATURE.investmentTransactionsParsing,
      modelId: CUSTOM_MODEL_ID,
      customEndpointId: endpoint.id,
      raw: true,
    });

    const estimate = await helpers.investmentImportEstimateCost({
      payload: { fileBase64: tradesBase64() },
      raw: true,
    });

    expect(estimate.modelId).toBe(CUSTOM_MODEL_ID);
    expect(estimate.modelName).toBe(CUSTOM_ENDPOINT_MODEL);
    expect(estimate.usingUserKey).toBe(true);
    expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
    expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);
    expect(estimate.estimatedCostUsd).toBeNull();
  });

  it('prices a catalog model from the catalog', async () => {
    const userId = await getTestUserId();
    await seedApiKey({ userId, provider: AI_PROVIDER.google });

    const estimate = await helpers.investmentImportEstimateCost({
      payload: { fileBase64: tradesBase64() },
      raw: true,
    });

    expect(estimate.modelId).toBe(CATALOG_MODEL_ID);
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
  });
});

const BROKER_EXPORT_BASE64 = Buffer.from('Broker export\nBTC 0.05 @ 42000 USD on 2024-01-15', 'utf-8').toString(
  'base64',
);

describe('Investment transactions AI extraction against a dead endpoint', () => {
  useSelfHostWithoutServerAiKeys();

  it('names the endpoint and flags it when the server is gone', async () => {
    const userId = await getTestUserId();
    await createFirstEndpoint();
    const portfolio = await helpers.createPortfolio({
      payload: helpers.buildPortfolioPayload({ name: 'AI import' }),
      raw: true,
    });
    global.mswMockServer.use(getCustomEndpointOfflineMock());

    const response = await helpers.investmentImportExtract({
      payload: { fileBase64: BROKER_EXPORT_BASE64, defaultPortfolioId: portfolio.id },
    });

    expect(errorMessage({ response })).toMatch(/did not respond/i);
    expect(errorMessage({ response })).not.toContain(CUSTOM_ENDPOINT_MODEL);

    const [stored] = await readStoredEndpoints({ userId });
    expect(stored?.status).toBe('invalid');
    expect(stored?.lastError).toMatch(/did not respond/i);
  });
});
