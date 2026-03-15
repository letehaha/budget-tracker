import { AI_PROVIDER } from '@bt/shared/types';
import { APICallError, generateText } from 'ai';

import { createAIClientWithConfig } from './ai-client-factory';
import { AI_MODEL_ID } from './models-config';

/**
 * Default models to use for validation (cheapest/fastest per provider)
 */
const VALIDATION_MODELS: Record<AI_PROVIDER, AI_MODEL_ID> = {
  [AI_PROVIDER.openai]: AI_MODEL_ID['openai/gpt-4o-mini'],
  [AI_PROVIDER.anthropic]: AI_MODEL_ID['anthropic/claude-3-5-haiku-latest'],
  [AI_PROVIDER.google]: AI_MODEL_ID['google/gemini-2.5-flash-lite'],
  [AI_PROVIDER.groq]: AI_MODEL_ID['groq/llama-3.1-8b-instant'],
};

interface APIKeyValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Error message shown to user when API key validation fails.
 * Covers: invalid key, expired key, insufficient funds, wrong permissions, etc.
 */
const GENERIC_INVALID_KEY_MESSAGE =
  'API key is not working. Please verify the key is correct, has sufficient credits, and has the required permissions.';

/**
 * Check if an error is a temporary/transient error that shouldn't mark the key as invalid.
 * Returns true for rate limits (429) and server errors (5xx).
 */
export function isTemporaryError(error: unknown): boolean {
  if (error instanceof APICallError) {
    const status = error.statusCode;
    // 429 = rate limit, 5xx = server errors
    if (status === 429 || (status && status >= 500)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an error is an authentication/authorization error.
 * Returns true for 401 (unauthorized) and 403 (forbidden).
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof APICallError) {
    const status = error.statusCode;
    return status === 401 || status === 403;
  }
  // Also check for common auth error messages in case status code is not available
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
 * Validates an API key by making a minimal test call to the provider.
 * Uses the cheapest/fastest model for each provider to minimize cost.
 *
 * @returns ValidationResult with isValid=true if key works, or error message if not
 */
export async function validateApiKey({
  provider,
  apiKey,
}: {
  provider: AI_PROVIDER;
  apiKey: string;
}): Promise<APIKeyValidationResult> {
  const modelId = VALIDATION_MODELS[provider];

  try {
    const model = createAIClientWithConfig({
      provider,
      modelId,
      apiKey,
    });

    // Make a minimal test call - just ask for a single word response
    const res = await generateText({
      model,
      prompt: "Reply with only the word 'ok'",
      maxOutputTokens: 5,
    });

    console.log('res', res);

    return { isValid: true };
  } catch (error) {
    // Check if it's a temporary error - we should still consider the key valid
    if (isTemporaryError(error)) {
      // Key might be valid, just rate limited or provider having issues
      // We'll accept it for now - if it keeps failing, it'll be marked invalid during actual usage
      return { isValid: true };
    }

    // For auth errors or any other errors, the key is invalid
    return {
      isValid: false,
      error: GENERIC_INVALID_KEY_MESSAGE,
    };
  }
}
