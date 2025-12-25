export { createAIClient, createAIClientWithConfig, type AIClientResult } from './ai-client-factory';
export { resolveAIConfiguration, isAIFeatureAvailable, type AIConfigResolution } from './ai-model-resolver';
export { validateApiKey, isTemporaryError, isAuthError, type APIKeyValidationResult } from './api-key-validation';
export {
  AI_MODEL_ID,
  AVAILABLE_MODELS,
  getDefaultModelForFeature,
  getAvailableModels,
  getModelInfo,
  isValidModelId,
  getRecommendedModelIds,
  isModelRecommendedForFeature,
  getProviderFromModelId,
  getFirstAvailableRecommendedModel,
} from './models-config';
