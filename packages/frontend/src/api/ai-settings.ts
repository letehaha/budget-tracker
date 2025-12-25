import { api } from '@/api/_api';
import {
  AIApiKeyInfo,
  AIFeatureStatus,
  AIModelInfoWithRecommendation,
  AI_FEATURE,
  AI_PROVIDER,
} from '@bt/shared/types';

// ===== API Key Management =====

export interface AiApiKeyStatusResponse {
  hasApiKey: boolean;
  providers: AIApiKeyInfo[];
  defaultProvider?: AI_PROVIDER;
}

export const getAiApiKeyStatus = async (): Promise<AiApiKeyStatusResponse> => {
  return api.get('/user/settings/ai/api-keys');
};

export const setAiApiKey = async ({
  provider,
  apiKey,
}: {
  provider: AI_PROVIDER;
  apiKey: string;
}): Promise<{ success: boolean }> => {
  return api.put('/user/settings/ai/api-keys', { provider, apiKey });
};

export const deleteAiApiKey = async ({ provider }: { provider: AI_PROVIDER }): Promise<{ success: boolean }> => {
  return api.delete('/user/settings/ai/api-keys', { data: { provider } });
};

export const setDefaultAiProvider = async ({ provider }: { provider: AI_PROVIDER }): Promise<{ success: boolean }> => {
  return api.put('/user/settings/ai/api-keys/default', { provider });
};

// ===== Feature Configuration =====

export interface AiFeaturesStatusResponse {
  features: AIFeatureStatus[];
}

export const getAiFeaturesStatus = async (): Promise<AiFeaturesStatusResponse> => {
  return api.get('/user/settings/ai/features');
};

export const setAiFeatureConfig = async ({
  feature,
  modelId,
}: {
  feature: AI_FEATURE;
  modelId: string;
}): Promise<AIFeatureStatus> => {
  return api.put(`/user/settings/ai/features/${feature}`, { modelId });
};

export const resetAiFeatureConfig = async ({ feature }: { feature: AI_FEATURE }): Promise<AIFeatureStatus> => {
  return api.delete(`/user/settings/ai/features/${feature}`);
};

// ===== Available Models =====

export interface AvailableModelsResponse {
  models: AIModelInfoWithRecommendation[];
}

export const getAvailableModels = async ({
  provider,
  feature,
}: {
  provider?: AI_PROVIDER;
  feature?: AI_FEATURE;
} = {}): Promise<AvailableModelsResponse> => {
  const params: Record<string, string> = {};
  if (provider) params.provider = provider;
  if (feature) params.feature = feature;
  return api.get('/user/settings/ai/models', params);
};
