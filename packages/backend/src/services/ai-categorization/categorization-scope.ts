/**
 * Which rows a categorization run may touch. The two entry points want different sets:
 *
 * - `defaultCategoryOnly` — the candidates screen and the manual trigger. "Waiting for
 *   categorization" means still sitting in the default category, and every row the user
 *   sees in that list is there by construction.
 * - `anyCategory` — the sync and import auto-path. A `hint`-mode Payee rule fills a real
 *   category and leaves `categorizationMeta` null precisely so the AI may still override
 *   it, which a default-category filter would make impossible.
 *
 * Kept free of model imports so the queue and the listeners can carry it without pulling
 * the Sequelize graph into their unit tests.
 */
export const CATEGORIZATION_SCOPE = {
  defaultCategoryOnly: 'default-category-only',
  anyCategory: 'any-category',
} as const;

export type CategorizationScope = (typeof CATEGORIZATION_SCOPE)[keyof typeof CATEGORIZATION_SCOPE];
