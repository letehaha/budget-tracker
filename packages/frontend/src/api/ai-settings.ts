import { api } from '@/api/_api';
import {
  AIApiKeyInfo,
  AICustomEndpointInfo,
  AIKeyProvider,
  AIFeatureStatus,
  AIModelInfoWithRecommendation,
  AI_FEATURE,
} from '@bt/shared/types';

// ===== API Key Management =====

export interface AiApiKeyStatusResponse {
  hasApiKey: boolean;
  providers: AIApiKeyInfo[];
  defaultProvider?: AIKeyProvider;
}

export const getAiApiKeyStatus = async (): Promise<AiApiKeyStatusResponse> => {
  return api.get('/user/settings/ai/api-keys');
};

export const setAiApiKey = async ({
  provider,
  apiKey,
}: {
  provider: AIKeyProvider;
  apiKey: string;
}): Promise<{ success: boolean }> => {
  return api.put('/user/settings/ai/api-keys', { provider, apiKey });
};

export const deleteAiApiKey = async ({ provider }: { provider: AIKeyProvider }): Promise<{ success: boolean }> => {
  return api.delete('/user/settings/ai/api-keys', { data: { provider } });
};

export const setDefaultAiProvider = async ({
  provider,
}: {
  provider: AIKeyProvider;
}): Promise<{ success: boolean }> => {
  return api.put('/user/settings/ai/api-keys/default', { provider });
};

// ===== Feature Configuration =====

export interface AiFeaturesStatusResponse {
  features: AIFeatureStatus[];
}

export const getAiFeaturesStatus = async (): Promise<AiFeaturesStatusResponse> => {
  return api.get('/user/settings/ai/features');
};

/** `customEndpointId` is required for `custom/<model>` ids, ignored for catalog models. */
export const setAiFeatureConfig = async ({
  feature,
  modelId,
  customEndpointId,
}: {
  feature: AI_FEATURE;
  modelId: string;
  customEndpointId?: string;
}): Promise<AIFeatureStatus> => {
  return api.put(`/user/settings/ai/features/${feature}`, { modelId, customEndpointId });
};

export const resetAiFeatureConfig = async ({ feature }: { feature: AI_FEATURE }): Promise<AIFeatureStatus> => {
  return api.delete(`/user/settings/ai/features/${feature}`);
};

// ===== Custom Instructions =====

export interface CustomInstructionsResponse {
  instructions: string | null;
}

export const getCustomInstructions = async (): Promise<CustomInstructionsResponse> => {
  return api.get('/user/settings/ai/custom-instructions');
};

export const setCustomInstructions = async ({
  instructions,
}: {
  instructions: string;
}): Promise<{ success: boolean }> => {
  return api.put('/user/settings/ai/custom-instructions', { instructions });
};

// ===== Available Models =====

export interface AvailableModelsResponse {
  models: AIModelInfoWithRecommendation[];
}

export const getAvailableModels = async ({
  provider,
  feature,
}: {
  provider?: AIKeyProvider;
  feature?: AI_FEATURE;
} = {}): Promise<AvailableModelsResponse> => {
  const params: Record<string, string> = {};
  if (provider) params.provider = provider;
  if (feature) params.feature = feature;
  return api.get('/user/settings/ai/models', params);
};

// ===== Custom Endpoints =====

interface TestCustomEndpointResponse {
  isValid: boolean;
  error?: string;
}

export const getCustomEndpoints = async (): Promise<AICustomEndpointInfo[]> => {
  return api.get('/user/settings/ai/custom-endpoints');
};

/** Backend validates the connection before saving and rejects a duplicate `name`. */
export const createCustomEndpoint = async ({
  name,
  baseUrl,
  defaultModel,
  apiKey,
}: {
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKey?: string | null;
}): Promise<AICustomEndpointInfo> => {
  return api.post('/user/settings/ai/custom-endpoints', { name, baseUrl, defaultModel, apiKey });
};

/**
 * Partial update. Omitted fields keep their stored values. `apiKey`: omit to keep
 * the stored key, `null` to remove it, a string to replace it.
 */
export const updateCustomEndpoint = async ({
  id,
  name,
  baseUrl,
  defaultModel,
  apiKey,
}: {
  id: string;
  name?: string;
  baseUrl?: string;
  defaultModel?: string;
  apiKey?: string | null;
}): Promise<AICustomEndpointInfo> => {
  return api.put(`/user/settings/ai/custom-endpoints/${id}`, { name, baseUrl, defaultModel, apiKey });
};

/** Backend remaps or drops the feature configs bound to this endpoint. */
export const deleteCustomEndpoint = async ({ id }: { id: string }): Promise<{ success: boolean }> => {
  return api.delete(`/user/settings/ai/custom-endpoints/${id}`);
};

/** Either name a saved endpoint or supply a full connection. The backend rejects anything else. */
type TestCustomEndpointPayload =
  | {
      /** Omitted fields fall back to this endpoint's stored values, including its key. */
      endpointId: string;
      baseUrl?: string;
      defaultModel?: string;
      apiKey?: string;
    }
  | {
      baseUrl: string;
      defaultModel: string;
      apiKey?: string;
    };

/** Probes an endpoint without persisting anything. */
export const testCustomEndpoint = async (payload: TestCustomEndpointPayload): Promise<TestCustomEndpointResponse> => {
  return api.post('/user/settings/ai/custom-endpoints/test', payload);
};
