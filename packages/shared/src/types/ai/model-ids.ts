/**
 * Enum of all available model IDs.
 * TypeScript will ensure all models are covered in provider configs.
 *
 * Format is `provider/model`, where everything after the first slash is passed
 * to the provider SDK verbatim – Groq's GPT-OSS names contain a slash of their own.
 *
 * Each provider keeps 3-4 models spanning a capability/cost range. Anything the
 * provider stops serving must move to `RETIRED_MODELS` so stored user picks
 * still resolve.
 */
export enum AI_MODEL_ID {
  // OpenAI
  'openai/gpt-5.6-sol' = 'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra' = 'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna' = 'openai/gpt-5.6-luna',
  'openai/gpt-5.4-nano' = 'openai/gpt-5.4-nano',

  // Anthropic - using Vercel AI SDK model names
  'anthropic/claude-opus-5' = 'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5' = 'anthropic/claude-sonnet-5',
  'anthropic/claude-haiku-4-5' = 'anthropic/claude-haiku-4-5',

  // Google
  'google/gemini-3.1-pro-preview' = 'google/gemini-3.1-pro-preview',
  'google/gemini-3.6-flash' = 'google/gemini-3.6-flash',
  'google/gemini-3.5-flash-lite' = 'google/gemini-3.5-flash-lite',
  'google/gemma-4-31b-it' = 'google/gemma-4-31b-it',

  // Groq
  'groq/openai/gpt-oss-120b' = 'groq/openai/gpt-oss-120b',
  'groq/openai/gpt-oss-20b' = 'groq/openai/gpt-oss-20b',
  'groq/llama-3.3-70b-versatile' = 'groq/llama-3.3-70b-versatile',

  // OpenRouter - the second segment is the upstream provider in OpenRouter's model slug
  'openrouter/openai/gpt-oss-20b' = 'openrouter/openai/gpt-oss-20b',
  'openrouter/openai/gpt-5.4-nano' = 'openrouter/openai/gpt-5.4-nano',
  'openrouter/google/gemini-3.5-flash-lite' = 'openrouter/google/gemini-3.5-flash-lite',
  'openrouter/anthropic/claude-haiku-4.5' = 'openrouter/anthropic/claude-haiku-4.5',
}
