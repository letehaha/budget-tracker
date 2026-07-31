import { AI_CUSTOM_MODEL_NAME_MAX_LENGTH } from '@bt/shared/types';
import { z } from 'zod';

// Shared by the endpoint routes. Each route decides required/optional/nullable
// itself, so these are exported bare.

/** Endpoint root, e.g. `https://ollama.home.lan/v1` */
export const baseUrlField = z.string().url().max(500);

/** Free-text model name, passed to the endpoint verbatim */
export const defaultModelField = z.string().min(1).max(AI_CUSTOM_MODEL_NAME_MAX_LENGTH);

/** Credential the endpoint expects, if it needs one at all */
export const apiKeyField = z.string().min(1).max(500);
