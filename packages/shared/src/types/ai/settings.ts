import { AI_FEATURE, AI_PROVIDER } from '../enums';
import type { Equals, Expect } from '../type-testing';

export type AIModelCapability =
  | 'text-generation'
  | 'structured-output'
  | 'function-calling'
  | 'vision'
  | 'fast-inference'
  | 'agents';

export type AIModelCostTier = 'free' | 'low' | 'medium' | 'high';

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
  provider: AIKeyProvider;
  description: string;
  /** Maximum context window in tokens */
  contextWindow: number;
  capabilities: AIModelCapability[];
  costTier: AIModelCostTier;
  /** Pricing per 1M tokens (optional for free-tier models) */
  pricing?: AIModelPricing;
}

export interface AIModelInfoWithRecommendation extends AIModelInfo {
  recommendedForFeature?: boolean;
}

/** Per-feature model configuration stored in UserSettings.settings.ai.featureConfigs[] */
export interface AIFeatureConfig {
  feature: AI_FEATURE;
  /** Model ID in 'provider/model' format: 'openai/gpt-5.6-terra' */
  modelId: string;
  /**
   * Present exactly when `modelId` is a `custom/*` ID. Kept separate from `modelId` because a
   * custom model name may itself contain slashes.
   */
  customEndpointId?: string;
}

/**
 * Providers whose credentials are a plain API key in `UserSettings.settings.ai.apiKeys`.
 * `AI_PROVIDER.custom` is absent because it stores a base URL under `customEndpoints`, so it
 * must never appear in key CRUD, provider pickers or `defaultProvider`.
 */
export type AIKeyProvider = Exclude<AI_PROVIDER, AI_PROVIDER.custom>;

export const AI_KEY_PROVIDERS = [
  AI_PROVIDER.anthropic,
  AI_PROVIDER.openai,
  AI_PROVIDER.google,
  AI_PROVIDER.groq,
  AI_PROVIDER.openrouter,
] as const satisfies readonly AIKeyProvider[];

/**
 * Pins `AI_KEY_PROVIDERS` to list every key provider, which the `satisfies` above alone does
 * not. Exported only so the assertion isn't flagged as unused.
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

/**
 * Gate UI preselection on `isConfigured`, never on `customEndpointId` being present.
 * Every other field describes the model that would answer a call right now, which can
 * differ from the user's stored pick.
 */
export interface AIFeatureStatus {
  feature: AI_FEATURE;
  /** Whether user has custom config (false = using default) */
  isConfigured: boolean;
  /** Model ID in 'provider/model' format */
  modelId: string;
  modelName: string;
  /** Whether the user's own credentials (API key or custom endpoint) pay for the call */
  usingUserKey: boolean;
  /** Set only when a `custom/*` model answers; names the endpoint serving it */
  customEndpointId?: string;
  endpointName?: string;
}

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

export const AI_CUSTOM_MODEL_NAME_MAX_LENGTH = 200;

export const AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH = 50;

export function isCustomModelId({ modelId }: { modelId: string }): boolean {
  return modelId.startsWith(AI_CUSTOM_MODEL_PREFIX);
}

export function buildCustomModelId({ modelName }: { modelName: string }): string {
  return `${AI_CUSTOM_MODEL_PREFIX}${modelName}`;
}

export function getModelNameFromModelId({ modelId }: { modelId: string }): string {
  const parts = modelId.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : modelId;
}
