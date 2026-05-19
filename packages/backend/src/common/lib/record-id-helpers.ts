/**
 * Test fixture helpers for record IDs.
 *
 * - `NONEXISTENT_ID` — a fixed sentinel UUID guaranteed to never match a
 *   real row (zero-filled). Use it for 404 / authorization checks where
 *   the test intentionally references a missing record.
 * - `generateRandomRecordId` — produces a fresh UUIDv7. Use it everywhere
 *   else a placeholder identifier is needed so tests don't share state and
 *   don't hard-code arbitrary UUID strings.
 *
 * Both return branded `RecordId` so tests integrate with the type system
 * without explicit casts at call sites.
 */
import type { RecordId } from '@bt/shared/types';
import { v7 as uuidv7 } from 'uuid';

export { NONEXISTENT_ID } from '@bt/shared/types';

export function generateRandomRecordId(): RecordId {
  return uuidv7() as RecordId;
}
