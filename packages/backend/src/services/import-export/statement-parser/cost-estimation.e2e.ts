import type { StatementFileType, StatementTextExtractionFailure } from '@bt/shared/types';
import { AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  ENCRYPTED_STATEMENT_PASSWORD,
  STATEMENT_PDF_FIXTURES,
  readStatementPdfFixture,
} from '@tests/fixtures/statement-parser-fixtures';
import * as helpers from '@tests/helpers';
import { createFirstEndpoint, getTestUserId, seedApiKey, setAiFeatureConfig } from '@tests/helpers/user-settings';
import { CUSTOM_ENDPOINT_MODEL } from '@tests/mocks/openai-compatible/mock-api';

// The estimate makes no AI call, so every case here is decided by the model resolution ladder.

const CUSTOM_MODEL_ID = `custom/${CUSTOM_ENDPOINT_MODEL}`;

/** Catalog default for statement parsing, so a seeded Google key is enough to reach it. */
const CATALOG_MODEL_ID = 'google/gemini-3.6-flash';

/** Catalog model priced at 0/0, a known free price that must never read as unknown. */
const FREE_CATALOG_MODEL_ID = 'google/gemma-4-31b-it';

/** Server keys let the ladder answer without user credentials, so every case starts without them. */
const SERVER_KEY_ENV_VARS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
] as const;

const STATEMENT_CSV = [
  'date;description;amount',
  '2026-06-01;Grocery store;-42.10',
  '2026-06-02;Salary;2500.00',
  '2026-06-03;Coffee;-4.50',
].join('\n');

function statementBase64(): string {
  return Buffer.from(STATEMENT_CSV, 'utf-8').toString('base64');
}

function pdfFixtureBase64({ file }: { file: string }): string {
  return readStatementPdfFixture({ file }).toString('base64');
}

/** Shape the endpoint answers 200 with when no text could be read from the file. */
interface EstimateFailureResponse {
  success: false;
  textExtraction: StatementTextExtractionFailure;
  fileType: StatementFileType;
  suggestion: string;
}

async function estimateFailure({ file, password }: { file: string; password?: string }) {
  const response = await helpers.statementEstimateCost({
    payload: { fileBase64: pdfFixtureBase64({ file }), password },
  });

  expect(response.statusCode).toBe(200);

  return response.body.response as unknown as EstimateFailureResponse;
}

describe('Statement parser cost estimation', () => {
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
    expect(estimate.estimatedCostUsd).toBeNull();
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
  });

  it('prices a free catalog model at $0, not at "unknown"', async () => {
    const userId = await getTestUserId();
    await seedApiKey({ userId, provider: AI_PROVIDER.google });
    await setAiFeatureConfig({ feature: AI_FEATURE.statementParsing, modelId: FREE_CATALOG_MODEL_ID, raw: true });

    const estimate = await helpers.statementEstimateCost({ payload: { fileBase64: statementBase64() }, raw: true });

    expect(estimate.modelId).toBe(FREE_CATALOG_MODEL_ID);
    expect(estimate.estimatedCostUsd).toBe(0);
    expect(estimate.estimatedCostUsd).not.toBeNull();
  });

  // An encrypted PDF and a scanned one both yield zero text, and the fix for one
  // (type the password) is useless for the other, so the codes must stay distinct.
  describe('PDFs no text can be read from', () => {
    it('separates a missing password, a rejected password and a missing text layer', async () => {
      const missingPassword = await estimateFailure({ file: STATEMENT_PDF_FIXTURES.encrypted });

      expect(missingPassword.success).toBe(false);
      expect(missingPassword.textExtraction.success).toBe(false);
      expect(missingPassword.textExtraction.errorCode).toBe('PASSWORD_REQUIRED');
      expect(missingPassword.fileType).toBe('pdf');

      const rejectedPassword = await estimateFailure({
        file: STATEMENT_PDF_FIXTURES.encrypted,
        password: 'not-the-password',
      });

      expect(rejectedPassword.success).toBe(false);
      expect(rejectedPassword.textExtraction.errorCode).toBe('PASSWORD_INVALID');

      const noTextLayer = await estimateFailure({ file: STATEMENT_PDF_FIXTURES.noTextLayer });

      expect(noTextLayer.success).toBe(false);
      expect(noTextLayer.textExtraction.errorCode).toBe('NO_TEXT_CONTENT');
    });

    it('estimates normally once the correct password is supplied', async () => {
      const userId = await getTestUserId();
      await seedApiKey({ userId, provider: AI_PROVIDER.google });

      const estimate = await helpers.statementEstimateCost({
        payload: {
          fileBase64: pdfFixtureBase64({ file: STATEMENT_PDF_FIXTURES.encrypted }),
          password: ENCRYPTED_STATEMENT_PASSWORD,
        },
        raw: true,
      });

      expect(estimate.textExtraction.success).toBe(true);
      expect(estimate.textExtraction.characterCount).toBeGreaterThan(0);
      expect(estimate.modelId).toBe(CATALOG_MODEL_ID);
      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
    });
  });
});
