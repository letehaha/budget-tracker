export { createAIClient, type AIClientResult } from './ai-client-factory';
export { resolveAIConfiguration } from './ai-model-resolver';
export { validateApiKey, isTemporaryError, isAuthError } from './api-key-validation';
export {
  getDefaultModelForFeature,
  getAvailableModels,
  getModelInfo,
  isValidModelId,
  isModelRecommendedForFeature,
  getProviderFromModelId,
  getFirstAvailableRecommendedModel,
} from './models-config';
