import { AI_FEATURE, AI_PROVIDER } from '../enums';
import type { Equals, Expect } from '../type-testing';

/** Model capability types for display in UI */
export type AIModelCapability =
  | 'text-generation'
  | 'structured-output'
  | 'function-calling'
  | 'vision'
  | 'fast-inference'
  | 'agents';

/** Cost tier for model pricing indication */
export type AIModelCostTier = 'free' | 'low' | 'medium' | 'high';

/** Pricing info for a model (per 1M tokens) */
export interface AIModelPricing {
  /** Cost per 1M input tokens in USD */
  inputPerMillion: number;
  /** Cost per 1M output tokens in USD */
  outputPerMillion: number;
}

/** Static config returned via API for frontend display. Not stored in DB. */
export interface AIModelInfo {
  /** Full model ID in 'provider/model' format: 'openai/gpt-5.6-terra' */
  id: string;
  name: string;
  /**
   * The catalog holds only first-party models, so `AI_PROVIDER.custom` never
   * appears here.
   */
  provider: AIKeyProvider;
  description: string;
  /** Maximum context window in tokens */
  contextWindow: number;
  capabilities: AIModelCapability[];
  costTier: AIModelCostTier;
  /** Pricing per 1M tokens (optional for free-tier models) */
  pricing?: AIModelPricing;
}

/** Model info with a recommendation flag for the feature that was queried. */
export interface AIModelInfoWithRecommendation extends AIModelInfo {
  recommendedForFeature?: boolean;
}

/** Per-feature model configuration stored in UserSettings.settings.ai.featureConfigs[] */
export interface AIFeatureConfig {
  feature: AI_FEATURE;
  /** Model ID in 'provider/model' format: 'openai/gpt-5.6-terra' */
  modelId: string;
  /**
   * Set for `custom/*` model IDs, absent for catalog models. Separate from
   * `modelId` because a custom model name may itself contain slashes.
   */
  customEndpointId?: string;
}

/**
 * Providers whose credentials are a plain API key in
 * `UserSettings.settings.ai.apiKeys`. `AI_PROVIDER.custom` is deliberately
 * absent: it stores a base URL plus an optional key under `customEndpoints`, so
 * it must never appear in key CRUD, provider pickers or `defaultProvider`.
 */
export type AIKeyProvider = Exclude<AI_PROVIDER, AI_PROVIDER.custom>;

export const AI_KEY_PROVIDERS = [
  AI_PROVIDER.anthropic,
  AI_PROVIDER.openai,
  AI_PROVIDER.google,
  AI_PROVIDER.groq,
] as const satisfies readonly AIKeyProvider[];

/**
 * `satisfies` only proves every listed member is a key provider, not that every
 * key provider is listed. This pins both directions, so a new non-custom
 * `AI_PROVIDER` member is a type error until `AI_KEY_PROVIDERS` covers it.
 * Exported only so it isn't flagged as unused; nothing should import it.
 */
export type AiKeyProvidersAreExhaustive = Expect<Equals<(typeof AI_KEY_PROVIDERS)[number], AIKeyProvider>>;

export type AIApiKeyStatus = 'valid' | 'invalid';

/** API key info returned to frontend, never the key value itself */
export interface AIApiKeyInfo {
  provider: AIKeyProvider;
  createdAt: string;
  status: AIApiKeyStatus;
  lastValidatedAt: string;
  lastError?: string;
  invalidatedAt?: string;
}

/** Custom endpoint info returned to frontend (never carries key material) */
export interface AICustomEndpointInfo {
  id: string;
  name: string;
  /** Endpoint root, normalized without a trailing slash */
  baseUrl: string;
  /** Free-text model name passed to the endpoint verbatim */
  defaultModel: string;
  hasApiKey: boolean;
  createdAt: string;
  status: AIApiKeyStatus;
  lastValidatedAt: string;
  lastError?: string;
  invalidatedAt?: string;
}

/** Feature status for UI display - returned via API */
export interface AIFeatureStatus {
  feature: AI_FEATURE;
  /** Whether user has custom config (false = using default) */
  isConfigured: boolean;
  /** Current model ID ('provider/model' format), or default if not configured */
  modelId: string;
  modelName: string;
  /** Whether user has their own API key for this model's provider */
  usingUserKey: boolean;
  /** Set only for `custom/*` model IDs */
  customEndpointId?: string;
  endpointName?: string;
}

/** Feature display info for UI - defined in frontend */
export interface AIFeatureDisplayInfo {
  name: string;
  description: string;
}

/** Maximum character length for custom AI categorization instructions */
export const AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH = 2000;

/**
 * Model ID prefix marking a model served by the user's own endpoint. Everything
 * after it is the free-text model name and may itself contain slashes.
 */
export const AI_CUSTOM_MODEL_PREFIX = 'custom/';

/** Maximum character length of the free-text model name after the prefix */
export const AI_CUSTOM_MODEL_NAME_MAX_LENGTH = 200;

/** Maximum character length of a custom endpoint's user-facing name */
export const AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH = 50;

/** True when a model ID points at the user's custom endpoint, not the built-in catalog */
export function isCustomModelId({ modelId }: { modelId: string }): boolean {
  return modelId.startsWith(AI_CUSTOM_MODEL_PREFIX);
}

/** Returns just the model name from a combined model ID */
export function getModelNameFromModelId({ modelId }: { modelId: string }): string {
  const parts = modelId.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : modelId;
}
