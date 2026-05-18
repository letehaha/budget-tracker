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
