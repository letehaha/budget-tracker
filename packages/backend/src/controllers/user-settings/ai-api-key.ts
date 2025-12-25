import { AI_PROVIDER } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import {
  getAiApiKeyInfo,
  hasAiApiKey,
  removeAllAiApiKeys,
  setAiApiKey,
  setDefaultAiProvider,
} from '@services/user-settings/ai-api-key';
import { z } from 'zod';

/**
 * Get information about configured AI API keys
 */
const getSchema = z.object({});

export const getAiApiKeyStatus = createController(getSchema, async ({ user }) => {
  const { id: userId } = user;

  const info = await getAiApiKeyInfo({ userId });
  const hasKey = await hasAiApiKey({ userId });

  return {
    data: {
      hasApiKey: hasKey,
      providers: info.providers,
      defaultProvider: info.defaultProvider,
    },
  };
});

/**
 * Set or update AI API key for a specific provider.
 * Validates the key first by making a test API call.
 */
const setSchema = z.object({
  body: z.object({
    apiKey: z.string().min(1).max(2056),
    provider: z.nativeEnum(AI_PROVIDER),
  }),
});

export const setAiApiKeyController = createController(setSchema, async ({ user, body }) => {
  const { id: userId } = user;
  const { apiKey, provider } = body;

  await setAiApiKey({ userId, apiKey, provider });

  return {
    data: {
      success: true,
    },
  };
});

/**
 * Set default AI provider
 */
const setDefaultSchema = z.object({
  body: z.object({
    provider: z.nativeEnum(AI_PROVIDER),
  }),
});

export const setDefaultAiProviderController = createController(setDefaultSchema, async ({ user, body }) => {
  const { id: userId } = user;
  const { provider } = body;

  await setDefaultAiProvider({ userId, provider });

  return {
    data: {
      success: true,
    },
  };
});

/**
 * Remove AI API key for a specific provider
 */
const deleteSchema = z.object({
  body: z.object({
    provider: z.nativeEnum(AI_PROVIDER),
  }),
});

export const deleteAiApiKey = createController(deleteSchema, async ({ user, body }) => {
  const { id: userId } = user;
  const { provider } = body;

  await setAiApiKey({ userId, apiKey: null, provider });

  return {
    data: {
      success: true,
    },
  };
});

/**
 * Remove all AI API keys
 */
const deleteAllSchema = z.object({});

export const deleteAllAiApiKeys = createController(deleteAllSchema, async ({ user }) => {
  const { id: userId } = user;

  await removeAllAiApiKeys({ userId });

  return {
    data: {
      success: true,
    },
  };
});
