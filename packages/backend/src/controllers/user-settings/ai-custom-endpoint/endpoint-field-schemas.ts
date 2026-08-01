import { AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH, AI_CUSTOM_MODEL_NAME_MAX_LENGTH } from '@bt/shared/types';
import { z } from 'zod';

// Bare field constraints. Each caller decides required/optional/nullable itself.

/** User-facing endpoint label, unique per user */
export const nameField = z.string().min(1).max(AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH);

/** Endpoint root, e.g. `https://ollama.home.lan/v1`. */
export const baseUrlField = z.url({ protocol: /^https?$/ }).max(500);

export const defaultModelField = z.string().min(1).max(AI_CUSTOM_MODEL_NAME_MAX_LENGTH);

export const apiKeyField = z.string().min(1).max(500);
