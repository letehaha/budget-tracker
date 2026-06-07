import { AI_MODEL_ID } from './model-ids';

// Maps retired model ID → live replacement. Reads upgrade via this map so
// stored stale IDs (e.g. provider-retired aliases) don't 404 at call time.
// Type-level cycle guard: keys can't be live `AI_MODEL_ID` (would map to
// `never`); a cycle would need a value to reappear as a key – impossible.
export const RETIRED_MODELS: Record<string, AI_MODEL_ID> & Partial<Record<AI_MODEL_ID, never>> = {
  'anthropic/claude-3-5-haiku-latest': AI_MODEL_ID['anthropic/claude-haiku-4-5'],
};
