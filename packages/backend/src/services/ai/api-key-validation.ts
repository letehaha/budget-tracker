import { AIKeyProvider, AI_PROVIDER } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { APICallError, RetryError, generateText } from 'ai';

import { createAIClientWithConfig } from './ai-client-factory';
import { AI_MODEL_ID } from './models-config';

/**
 * Models to try for validation, cheapest first. A key can authenticate fine while the
 * first model still rejects the call, because providers gate newer models per account
 * (OpenAI returns an instant 400/404 on `gpt-5.4-nano` for unverified organizations),
 * so each provider lists a second, more broadly available model before the key is
 * declared broken. Google leads with gemini-3.5-flash-lite rather than the cheaper free
 * gemma-4-31b-it, whose tier is rate-limited hard enough to make validation flaky.
 * `AI_PROVIDER.custom` is absent: `validateCustomEndpoint` uses the model the user typed.
 */
const VALIDATION_MODELS: Record<AIKeyProvider, AI_MODEL_ID[]> = {
  [AI_PROVIDER.openai]: [AI_MODEL_ID['openai/gpt-5.4-nano'], AI_MODEL_ID['openai/gpt-5.6-luna']],
  [AI_PROVIDER.anthropic]: [AI_MODEL_ID['anthropic/claude-haiku-4-5'], AI_MODEL_ID['anthropic/claude-sonnet-5']],
  [AI_PROVIDER.google]: [AI_MODEL_ID['google/gemini-3.5-flash-lite'], AI_MODEL_ID['google/gemini-3.6-flash']],
  [AI_PROVIDER.groq]: [AI_MODEL_ID['groq/openai/gpt-oss-20b'], AI_MODEL_ID['groq/llama-3.3-70b-versatile']],
};

/** Prompt used by every validation call — one word out. Each call site sets its own output budget. */
export const VALIDATION_PROMPT = "Reply with only the word 'ok'";

interface APIKeyValidationResult {
  isValid: boolean;
  error?: string;
}

/** Generic on purpose: covers invalid key, expired key, no credits, wrong permissions. */
const GENERIC_INVALID_KEY_MESSAGE =
  'API key is not working. Please verify the key is correct, has sufficient credits, and has the required permissions.';

/**
 * Transient failure that must not mark the key invalid: rate limits (429), server errors
 * (5xx), connection/header timeouts (no statusCode, but the SDK flags them retryable),
 * and retry-exhaustion. The `ai` SDK retries transient failures internally, then throws
 * RetryError, which is still transient and gets classified by its underlying cause.
 */
export function isTemporaryError(error: unknown): boolean {
  if (error instanceof RetryError) {
    return error.lastError ? isTemporaryError(error.lastError) : true;
  }
  if (error instanceof APICallError) {
    const status = error.statusCode;
    if (status === 429 || (status && status >= 500) || error.isRetryable) {
      return true;
    }
  }
  return false;
}

/** True for 401 and 403, or an auth-sounding message when no status code is available. */
export function isAuthError(error: unknown): boolean {
  if (error instanceof APICallError) {
    const status = error.statusCode;
    return status === 401 || status === 403;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('invalid api key') ||
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('api key not valid') ||
      message.includes('incorrect api key')
    );
  }
  return false;
}

/**
 * Validates an API key by making a minimal test call to the provider,
 * using that provider's cheapest and fastest model.
 */
export async function validateApiKey({
  provider,
  apiKey,
}: {
  provider: AIKeyProvider;
  apiKey: string;
}): Promise<APIKeyValidationResult> {
  const modelFailures: { modelId: AI_MODEL_ID; error: unknown }[] = [];

  for (const modelId of VALIDATION_MODELS[provider]) {
    try {
      const model = createAIClientWithConfig({
        provider,
        modelId,
        apiKey,
      });

      // The output budget stays above provider minimums (OpenAI's Responses API rejects
      // max_output_tokens below 16) and leaves room for models that spend reasoning tokens.
      await generateText({
        model,
        prompt: VALIDATION_PROMPT,
        maxOutputTokens: 64,
      });

      return { isValid: true };
    } catch (error) {
      if (isTemporaryError(error)) {
        // Says nothing about the key. Real usage marks it invalid if it keeps failing.
        return { isValid: true };
      }

      if (isAuthError(error)) {
        // A pasted wrong key is expected, so info level keeps it out of Sentry.
        // It would fail auth on every model, so skip the rest of the chain.
        logger.info('API key validation failed with auth error', { provider, modelId, error });
        return { isValid: false, error: GENERIC_INVALID_KEY_MESSAGE };
      }

      // The key authenticated but this model rejected the call (account-gated model,
      // decommissioned id). The next model in the chain settles which one it was.
      modelFailures.push({ modelId, error });
    }
  }

  // Every model rejected a key that never failed auth: likely our config, not a bad key.
  // Still reported invalid because we could not confirm it works.
  logger.error('API key validation failed with unexpected error', { provider, modelFailures });
  return { isValid: false, error: GENERIC_INVALID_KEY_MESSAGE };
}
