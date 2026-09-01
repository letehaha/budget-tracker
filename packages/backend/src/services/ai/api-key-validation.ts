import { AIKeyProvider, AI_PROVIDER } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { generateText } from 'ai';

import { createAIClientWithConfig } from './ai-client-factory';
import { isAuthError, isTemporaryError } from './ai-error-classifiers';
import { AI_MODEL_ID } from './models-config';

/**
 * Cheapest model first, two per provider: a key can authenticate fine while the first
 * model is rejected, because providers gate newer models per account. Google leads with
 * gemini-3.5-flash-lite because the free gemma-4-31b-it is rate-limited into flaky runs.
 */
const VALIDATION_MODELS: Record<AIKeyProvider, AI_MODEL_ID[]> = {
  [AI_PROVIDER.openai]: [AI_MODEL_ID['openai/gpt-5.4-nano'], AI_MODEL_ID['openai/gpt-5.6-luna']],
  [AI_PROVIDER.anthropic]: [AI_MODEL_ID['anthropic/claude-haiku-4-5'], AI_MODEL_ID['anthropic/claude-sonnet-5']],
  [AI_PROVIDER.google]: [AI_MODEL_ID['google/gemini-3.5-flash-lite'], AI_MODEL_ID['google/gemini-3.6-flash']],
  [AI_PROVIDER.groq]: [AI_MODEL_ID['groq/openai/gpt-oss-20b'], AI_MODEL_ID['groq/llama-3.3-70b-versatile']],
  [AI_PROVIDER.openrouter]: [
    AI_MODEL_ID['openrouter/openai/gpt-oss-20b'],
    AI_MODEL_ID['openrouter/openai/gpt-5.4-nano'],
  ],
};

/** Kept to one word so call sites can cap output at a few tokens. */
export const VALIDATION_PROMPT = "Reply with only the word 'ok'";

interface APIKeyValidationResult {
  isValid: boolean;
  error?: string;
}

/** Generic on purpose: covers invalid key, expired key, no credits, wrong permissions. */
const GENERIC_INVALID_KEY_MESSAGE =
  'API key is not working. Please verify the key is correct, has sufficient credits, and has the required permissions.';

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
      if (isTemporaryError({ error })) {
        // Says nothing about the key. Real usage marks it invalid if it keeps failing.
        return { isValid: true };
      }

      if (isAuthError({ error })) {
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
