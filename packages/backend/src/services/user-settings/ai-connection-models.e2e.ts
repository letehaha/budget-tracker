import { AI_PROVIDER, API_ERROR_CODES, ListAIConnectionModelsBody } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { runAsCloud, useSelfHostWithoutServerAiKeys } from '@tests/helpers/ai-test-env';
import { createFirstConnection, createOpenAiConnection } from '@tests/helpers/user-settings';
import {
  ANTHROPIC_LISTED_MODELS,
  INVALID_ANTHROPIC_API_KEY,
  VALID_ANTHROPIC_API_KEY,
} from '@tests/mocks/anthropic/mock-api';
import { GEMINI_LISTED_MODELS, INVALID_GEMINI_API_KEY, VALID_GEMINI_API_KEY } from '@tests/mocks/gemini/mock-api';
import { createCallsCounter } from '@tests/mocks/helpers';
import {
  CUSTOM_ENDPOINT_BASE_URL,
  CUSTOM_ENDPOINT_LISTED_MODELS,
  CUSTOM_ENDPOINT_LISTING_BASE_URL,
  CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
  CUSTOM_ENDPOINT_MODEL,
  CUSTOM_ENDPOINT_OFFLINE_BASE_URL,
  VALID_CUSTOM_ENDPOINT_API_KEY,
} from '@tests/mocks/openai-compatible/mock-api';
import { INVALID_OPENAI_API_KEY, OPENAI_LISTED_MODELS, VALID_OPENAI_API_KEY } from '@tests/mocks/openai/mock-api';
import { randomUUID } from 'node:crypto';

const MODELS_BUDGET_PER_MINUTE = 60;

const OPENAI_MODELS_URL = /^https:\/\/api\.openai\.com\/v1\/models/;
const ANTHROPIC_MODELS_URL = /^https:\/\/api\.anthropic\.com\/v1\/models/;

describe('AI connection model listing', () => {
  useSelfHostWithoutServerAiKeys();

  it('refuses to list models without a session', async () => {
    const response = await helpers.withoutSession(() =>
      helpers.listAiConnectionModels({
        provider: AI_PROVIDER.openai,
        apiKey: VALID_OPENAI_API_KEY,
      }),
    );

    expect(response.statusCode).toBe(401);
  });

  describe('happy path', () => {
    it.each([
      {
        provider: AI_PROVIDER.openai,
        apiKey: VALID_OPENAI_API_KEY,
        listed: OPENAI_LISTED_MODELS,
      },
      {
        provider: AI_PROVIDER.anthropic,
        apiKey: VALID_ANTHROPIC_API_KEY,
        listed: ANTHROPIC_LISTED_MODELS,
      },
      {
        provider: AI_PROVIDER.google,
        apiKey: VALID_GEMINI_API_KEY,
        listed: GEMINI_LISTED_MODELS,
      },
    ])('lists the models $provider serves, sorted', async ({ provider, apiKey, listed }) => {
      const { models } = await helpers.listAiConnectionModels({
        provider,
        apiKey,
        raw: true,
      });

      expect(models).toEqual(listed.toSorted());
    });

    it('lists the catalogue of a custom server', async () => {
      const { models } = await helpers.listAiConnectionModels({
        provider: AI_PROVIDER.custom,
        baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
        raw: true,
      });

      expect(models).toEqual(CUSTOM_ENDPOINT_LISTED_MODELS.toSorted());
    });
  });

  describe('providers that cannot be listed', () => {
    it.each([
      ['OpenAI rejects the key', { provider: AI_PROVIDER.openai, apiKey: INVALID_OPENAI_API_KEY }],
      ['Anthropic rejects the key', { provider: AI_PROVIDER.anthropic, apiKey: INVALID_ANTHROPIC_API_KEY }],
      ['Gemini rejects the key', { provider: AI_PROVIDER.google, apiKey: INVALID_GEMINI_API_KEY }],
      [
        'the custom server is unreachable',
        {
          provider: AI_PROVIDER.custom,
          baseUrl: CUSTOM_ENDPOINT_OFFLINE_BASE_URL,
        },
      ],
      ['the custom server has no /models route', { provider: AI_PROVIDER.custom, baseUrl: CUSTOM_ENDPOINT_BASE_URL }],
    ] as [string, ListAIConnectionModelsBody][])('answers 200 with no models when %s', async (_label, body) => {
      const response = await helpers.listAiConnectionModels(body);

      expect(response.statusCode).toBe(200);
      expect(response.body.response).toEqual({ models: [] });
    });

    it('answers no models for a native provider without a key, without dialling it', async () => {
      const calls = createCallsCounter(global.mswMockServer, OPENAI_MODELS_URL);

      const { models } = await helpers.listAiConnectionModels({
        provider: AI_PROVIDER.openai,
        raw: true,
      });

      expect(models).toEqual([]);
      expect(calls.count).toBe(0);
    });
  });

  describe('connectionId', () => {
    it('borrows the stored key of a native connection', async () => {
      const connection = await createOpenAiConnection();

      const withoutKey = await helpers.listAiConnectionModels({
        provider: AI_PROVIDER.openai,
        raw: true,
      });
      const borrowed = await helpers.listAiConnectionModels({
        provider: AI_PROVIDER.openai,
        connectionId: connection.id,
        raw: true,
      });

      expect(withoutKey.models).toEqual([]);
      expect(borrowed.models).toEqual(OPENAI_LISTED_MODELS.toSorted());
    });

    it('borrows the stored base URL and key of a custom connection', async () => {
      const connection = await helpers.createAiConnection({
        provider: AI_PROVIDER.custom,
        name: 'LM Studio',
        baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
        apiKey: VALID_CUSTOM_ENDPOINT_API_KEY,
        raw: true,
      });

      const { models } = await helpers.listAiConnectionModels({
        provider: AI_PROVIDER.custom,
        connectionId: connection.id,
        raw: true,
      });

      expect(models).toEqual(CUSTOM_ENDPOINT_LISTED_MODELS.toSorted());
    });

    it('prefers a key typed in the request over the stored one', async () => {
      const connection = await createOpenAiConnection();

      const { models } = await helpers.listAiConnectionModels({
        provider: AI_PROVIDER.openai,
        connectionId: connection.id,
        apiKey: INVALID_OPENAI_API_KEY,
        raw: true,
      });

      expect(models).toEqual([]);
    });

    it('refuses a connection of another provider and never sends its key there', async () => {
      const connection = await createOpenAiConnection();
      const anthropicCalls = createCallsCounter(global.mswMockServer, ANTHROPIC_MODELS_URL);

      const response = await helpers.listAiConnectionModels({
        provider: AI_PROVIDER.anthropic,
        connectionId: connection.id,
      });

      expect(response.statusCode).toBe(422);
      expect(anthropicCalls.count).toBe(0);
    });

    it('never sends a native key to a base URL from the request', async () => {
      const connection = await createOpenAiConnection();
      const listingCalls = createCallsCounter(global.mswMockServer, `${CUSTOM_ENDPOINT_LISTING_BASE_URL}/models`);

      const response = await helpers.listAiConnectionModels({
        provider: AI_PROVIDER.custom,
        connectionId: connection.id,
        baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
      });

      expect(response.statusCode).toBe(422);
      expect(listingCalls.count).toBe(0);
    });

    it('refuses an id that addresses no saved connection', async () => {
      await createFirstConnection();

      const response = await helpers.listAiConnectionModels({
        provider: AI_PROVIDER.custom,
        connectionId: randomUUID(),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('validation', () => {
    it.each([
      ['no provider', { apiKey: VALID_OPENAI_API_KEY }],
      ['a provider that is not supported', { provider: 'groq', apiKey: VALID_OPENAI_API_KEY }],
      [
        'a base URL for a native provider',
        {
          provider: AI_PROVIDER.openai,
          baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL,
        },
      ],
      ['a custom provider without a base URL', { provider: AI_PROVIDER.custom }],
      ['a malformed base URL', { provider: AI_PROVIDER.custom, baseUrl: 'not-a-url' }],
      ['an empty key', { provider: AI_PROVIDER.openai, apiKey: '' }],
      ['a connection id that is not a uuid', { provider: AI_PROVIDER.openai, connectionId: 'not-a-uuid' }],
    ])('rejects %s with 422', async (_label, body) => {
      const response = await helpers.listAiConnectionModels(body as unknown as ListAIConnectionModelsBody);

      expect(response.statusCode).toBe(422);
    });

    it.each([
      ['loopback IP', CUSTOM_ENDPOINT_LOOPBACK_BASE_URL],
      ['cloud metadata service', 'http://169.254.169.254/latest'],
      ['private 10/8 address', 'http://10.0.0.5/v1'],
    ])('rejects a %s in cloud mode', async (_label, baseUrl) => {
      runAsCloud();

      const response = await helpers.listAiConnectionModels({
        provider: AI_PROVIDER.custom,
        baseUrl,
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('rate limit', () => {
    it('caps listing per user without spending the probe budget', async () => {
      for (let attempt = 1; attempt <= MODELS_BUDGET_PER_MINUTE; attempt++) {
        const response = await helpers.listAiConnectionModels({
          provider: AI_PROVIDER.openai,
        });
        expect(response.statusCode).toBe(200);
      }

      const blocked = await helpers.listAiConnectionModels({
        provider: AI_PROVIDER.openai,
      });

      expect(blocked.statusCode).toBe(429);
      expect((blocked.body as unknown as { response?: { code?: string } }).response?.code).toBe(
        API_ERROR_CODES.tooManyRequests,
      );

      const probe = await helpers.testAiConnection({
        provider: AI_PROVIDER.custom,
        baseUrl: CUSTOM_ENDPOINT_BASE_URL,
        model: CUSTOM_ENDPOINT_MODEL,
      });
      expect(probe.statusCode).toBe(200);
    }, 30_000);
  });
});
