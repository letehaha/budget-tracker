import { createHash } from 'node:crypto';

/**
 * Hex SHA-256 of a buffer — the single digest the manifest builder, the restore
 * preflight, and the test helpers all share, so an export's checksum and a
 * restore's integrity check are guaranteed to be computed identically.
 */
export function sha256Hex({ buffer }: { buffer: Buffer }): string {
  return createHash('sha256').update(buffer).digest('hex');
}
