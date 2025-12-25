import { AI_FEATURE, AI_PROVIDER } from '../enums';

/**
 * Model capability types for display in UI
 */
export type AIModelCapability =
  | 'text-generation'
  | 'structured-output'
  | 'function-calling'
  | 'vision'
  | 'fast-inference'
  | 'agents';

/**
 * Cost tier for model pricing indication
 */
export type AIModelCostTier = 'free' | 'low' | 'medium' | 'high';

/**
 * Pricing info for a model (per 1M tokens)
 */
export interface AIModelPricing {
  /** Cost per 1M input tokens in USD */
  inputPerMillion: number;
  /** Cost per 1M output tokens in USD */
  outputPerMillion: number;
}

/**
 * Available model information - NOT stored in DB.
 * This is static config returned via API for frontend display.
 */
export interface AIModelInfo {
  /** Full model ID in 'provider/model' format: 'openai/gpt-4o' */
  id: string;
  /** Human-readable name: 'GPT-4o' */
  name: string;
  /** Provider enum value */
  provider: AI_PROVIDER;
  /** Short description of the model */
  description: string;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Model capabilities */
  capabilities: AIModelCapability[];
  /** Relative cost indication */
  costTier: AIModelCostTier;
  /** Pricing per 1M tokens (optional for free-tier models) */
  pricing?: AIModelPricing;
}

/**
 * Model info returned from API with context-specific recommendation flag.
 * When querying for a specific feature, this indicates if the model
 * is recommended for that feature.
 */
export interface AIModelInfoWithRecommendation extends AIModelInfo {
  /** Whether this model is recommended for the requested feature */
  recommendedForFeature?: boolean;
}

/**
 * Per-feature model configuration stored in UserSettings.settings.ai.featureConfigs[]
 */
export interface AIFeatureConfig {
  /** The AI feature this config applies to */
  feature: AI_FEATURE;
  /** Model ID in 'provider/model' format: 'openai/gpt-4o' */
  modelId: string;
}

/**
 * API key status
 */
export type AIApiKeyStatus = 'valid' | 'invalid';

/**
 * API key entry stored in UserSettings.settings.ai.apiKeys[]
 */
export interface AIApiKeyEntry {
  /** Provider this key belongs to */
  provider: AI_PROVIDER;
  /** Encrypted API key */
  keyEncrypted: string;
  /** ISO datetime when key was added */
  createdAt: string;
  /** Current validation status of the key */
  status: AIApiKeyStatus;
  /** ISO datetime when key was last successfully validated */
  lastValidatedAt: string;
  /** Error message if key is invalid */
  lastError?: string;
  /** ISO datetime when key was marked as invalid */
  invalidatedAt?: string;
}

/**
 * API key info returned to frontend (without actual key value)
 */
export interface AIApiKeyInfo {
  /** Provider this key belongs to */
  provider: AI_PROVIDER;
  /** ISO datetime when key was added */
  createdAt: string;
  /** Current validation status of the key */
  status: AIApiKeyStatus;
  /** ISO datetime when key was last successfully validated */
  lastValidatedAt: string;
  /** Error message if key is invalid */
  lastError?: string;
  /** ISO datetime when key was marked as invalid */
  invalidatedAt?: string;
}

/**
 * AI settings schema stored in UserSettings.settings.ai
 */
export interface AISettingsSchema {
  /** User's API keys per provider */
  apiKeys: AIApiKeyEntry[];
  /** User's default provider preference */
  defaultProvider?: AI_PROVIDER;
  /** Per-feature model configurations */
  featureConfigs: AIFeatureConfig[];
}

/**
 * Feature status for UI display - returned via API
 */
export interface AIFeatureStatus {
  /** The AI feature */
  feature: AI_FEATURE;
  /** Whether user has custom config (false = using default) */
  isConfigured: boolean;
  /** Current model ID ('provider/model' format), or default if not configured */
  modelId: string;
  /** Model display name */
  modelName: string;
  /** Whether user has their own API key for this model's provider */
  usingUserKey: boolean;
}

/**
 * Feature display info for UI - defined in frontend
 */
export interface AIFeatureDisplayInfo {
  /** Human-readable feature name */
  name: string;
  /** Feature description */
  description: string;
}

/**
 * Helper to extract provider from combined model ID
 */
export function getProviderFromModelId({ modelId }: { modelId: string }): AI_PROVIDER | null {
  const [providerStr] = modelId.split('/');
  if (Object.values(AI_PROVIDER).includes(providerStr as AI_PROVIDER)) {
    return providerStr as AI_PROVIDER;
  }
  return null;
}

/**
 * Helper to get just the model name from combined model ID
 */
export function getModelNameFromModelId({ modelId }: { modelId: string }): string {
  const parts = modelId.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : modelId;
}
