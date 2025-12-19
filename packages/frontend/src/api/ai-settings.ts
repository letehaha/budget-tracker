import { AI_PROVIDER } from '@bt/shared/types';

import { api } from './_api';

interface AiApiKeyProviderInfo {
  provider: AI_PROVIDER;
  createdAt: string;
}

interface AiApiKeyStatus {
  hasApiKey: boolean;
  providers: AiApiKeyProviderInfo[];
  defaultProvider?: AI_PROVIDER;
}

/**
 * Get AI API key status (whether user has configured one and provider info)
 */
export const getAiApiKeyStatus = async (): Promise<AiApiKeyStatus> => {
  const result = await api.get<AiApiKeyStatus>('/user/settings/ai-api-key');
  return result;
};

/**
 * Set or update AI API key for a specific provider
 */
export const setAiApiKey = async ({
  apiKey,
  provider,
}: {
  apiKey: string;
  provider: AI_PROVIDER;
}): Promise<{ success: boolean }> => {
  const result = await api.put('/user/settings/ai-api-key', { apiKey, provider });
  return result as { success: boolean };
};

/**
 * Set the default AI provider
 */
export const setDefaultAiProvider = async ({ provider }: { provider: AI_PROVIDER }): Promise<{ success: boolean }> => {
  const result = await api.put('/user/settings/ai-api-key/default', { provider });
  return result as { success: boolean };
};

/**
 * Remove AI API key for a specific provider
 */
export const deleteAiApiKey = async ({ provider }: { provider: AI_PROVIDER }): Promise<{ success: boolean }> => {
  const result = await api.delete('/user/settings/ai-api-key', { data: { provider } });
  return result as { success: boolean };
};

/**
 * Remove all AI API keys
 */
export const deleteAllAiApiKeys = async (): Promise<{ success: boolean }> => {
  const result = await api.delete('/user/settings/ai-api-key/all');
  return result as { success: boolean };
};
