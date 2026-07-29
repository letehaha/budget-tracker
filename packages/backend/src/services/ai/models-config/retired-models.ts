import { AI_MODEL_ID } from './model-ids';

// Maps retired model ID → live replacement. Reads upgrade via this map so
// stored stale IDs (e.g. provider-retired aliases) don't 404 at call time.
// The `AI_MODEL_ID` value type forces every replacement to be a currently-live
// catalog member, so one lookup hop always reaches a live model — a retired
// ID can never point at another retired one. The `Partial<Record<AI_MODEL_ID,
// never>>` intersection guards the other side: it rejects using an already-live
// ID as a key, so a live model can't be marked retired.
export const RETIRED_MODELS: Record<string, AI_MODEL_ID> & Partial<Record<AI_MODEL_ID, never>> = {
  // OpenAI GPT-4 generation
  'openai/gpt-4o': AI_MODEL_ID['openai/gpt-5.6-terra'],
  'openai/gpt-4-turbo': AI_MODEL_ID['openai/gpt-5.6-terra'],
  'openai/gpt-4o-mini': AI_MODEL_ID['openai/gpt-5.4-nano'],

  // Anthropic Claude 3.x / 4.x
  'anthropic/claude-3-5-haiku-latest': AI_MODEL_ID['anthropic/claude-haiku-4-5'],
  'anthropic/claude-3-7-sonnet-latest': AI_MODEL_ID['anthropic/claude-sonnet-5'],
  'anthropic/claude-opus-4-5': AI_MODEL_ID['anthropic/claude-opus-5'],
  'anthropic/claude-sonnet-4-5': AI_MODEL_ID['anthropic/claude-sonnet-5'],

  // Google Gemini 2.5 / early Gemini 3 previews
  'google/gemini-3-pro-preview': AI_MODEL_ID['google/gemini-3.1-pro-preview'],
  'google/gemini-3-flash-preview': AI_MODEL_ID['google/gemini-3.6-flash'],
  'google/gemini-2.5-pro': AI_MODEL_ID['google/gemini-3.1-pro-preview'],
  'google/gemini-2.5-flash': AI_MODEL_ID['google/gemini-3.6-flash'],
  'google/gemini-2.5-flash-lite': AI_MODEL_ID['google/gemini-3.5-flash-lite'],

  // Groq models decommissioned or superseded by GPT-OSS
  'groq/mixtral-8x7b-32768': AI_MODEL_ID['groq/openai/gpt-oss-20b'],
  'groq/llama-3.1-8b-instant': AI_MODEL_ID['groq/openai/gpt-oss-20b'],
};
