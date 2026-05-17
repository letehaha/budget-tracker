/**
 * Canonical identifier type for entity primary keys and foreign keys.
 *
 * Currently a plain `string` (UUIDv7) but defined as a named alias so the
 * underlying representation can change without touching every consumer.
 */
export type RecordId = string;
