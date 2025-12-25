export { createAIClient, createAIClientWithConfig, type AIClientResult } from './ai-client-factory';
export { resolveAIConfiguration, isAIFeatureAvailable, type AIConfigResolution } from './ai-model-resolver';
export {
  AI_MODEL_ID,
  AVAILABLE_MODELS,
  getDefaultModelForFeature,
  getAvailableModels,
  getModelInfo,
  isValidModelId,
  getRecommendedModelIds,
  isModelRecommendedForFeature,
} from './models-config';
