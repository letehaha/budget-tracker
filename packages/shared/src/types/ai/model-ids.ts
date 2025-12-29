/**
 * Enum of all available model IDs.
 * TypeScript will ensure all models are covered in provider configs.
 */
export enum AI_MODEL_ID {
  // OpenAI
  'openai/gpt-4o' = 'openai/gpt-4o',
  'openai/gpt-4o-mini' = 'openai/gpt-4o-mini',
  'openai/gpt-4-turbo' = 'openai/gpt-4-turbo',

  // Anthropic - using Vercel AI SDK model names
  'anthropic/claude-opus-4-5' = 'anthropic/claude-opus-4-5',
  'anthropic/claude-sonnet-4-5' = 'anthropic/claude-sonnet-4-5',
  'anthropic/claude-haiku-4-5' = 'anthropic/claude-haiku-4-5',
  'anthropic/claude-3-7-sonnet-latest' = 'anthropic/claude-3-7-sonnet-latest',
  'anthropic/claude-3-5-haiku-latest' = 'anthropic/claude-3-5-haiku-latest',

  // Google
  'google/gemini-3-pro-preview' = 'google/gemini-3-pro-preview',
  'google/gemini-3-flash-preview' = 'google/gemini-3-flash-preview',
  'google/gemini-2.5-pro' = 'google/gemini-2.5-pro',
  'google/gemini-2.5-flash' = 'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite' = 'google/gemini-2.5-flash-lite',

  // Groq
  'groq/llama-3.3-70b-versatile' = 'groq/llama-3.3-70b-versatile',
  'groq/llama-3.1-8b-instant' = 'groq/llama-3.1-8b-instant',
  'groq/mixtral-8x7b-32768' = 'groq/mixtral-8x7b-32768',
}
