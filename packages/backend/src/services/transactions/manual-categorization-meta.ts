import { CATEGORIZATION_SOURCE, type CategorizationMeta } from '@bt/shared/types';

/**
 * Stamp for a user-driven category change. Moving a transaction back to the default
 * category means "uncategorize it", and the AI candidate predicate only accepts rows
 * with no stamp, so clearing the meta puts the row back in the AI queue.
 */
export function buildManualCategorizationMeta({
  categoryId,
  defaultCategoryId,
}: {
  categoryId: string;
  defaultCategoryId: string | null;
}): CategorizationMeta | null {
  if (defaultCategoryId && categoryId === defaultCategoryId) return null;

  return { source: CATEGORIZATION_SOURCE.manual, categorizedAt: new Date().toISOString() };
}
