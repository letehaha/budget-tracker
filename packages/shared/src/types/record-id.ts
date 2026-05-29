/**
 * Canonical identifier type for entity primary keys and foreign keys.
 *
 * A UUID string at runtime, but nominally branded so TypeScript rejects
 * arithmetic coercion (`+id`, `Number(id)`, `id > 0`) and prevents accidental
 * assignment of arbitrary strings into ID positions. To produce a RecordId,
 * go through one of the canonical entry points:
 *   - Zod: `recordId()` from `@common/lib/zod/custom-types`
 *   - Tests/helpers: `generateRandomRecordId()` / `NONEXISTENT_ID` from
 *     `@common/lib/record-id-helpers`
 *   - Sequelize model fields declared as `RecordId`
 *
 * The brand is a compile-time fiction. At runtime, a RecordId is just a string.
 */
export type RecordId = string & { readonly __brand: 'RecordId' };

/**
 * Fixed sentinel UUID guaranteed to never match a real row (zero-filled).
 * Use for 404 / authorization checks where a missing record is intended.
 */
export const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000' as RecordId;
