import { RESOURCE_TYPES } from '@bt/shared/types';
import { z } from 'zod';

/**
 * Resource types the share API accepts on its public routes. Centralized so adding a new
 * shareable resource type is a single-file change instead of editing every controller's
 * Zod schema.
 */
export const shareableResourceTypeEnum = z.enum([
  RESOURCE_TYPES.account,
  RESOURCE_TYPES.household,
  RESOURCE_TYPES.budget,
] as const);
