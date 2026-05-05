import { randomBytes } from 'crypto';

/**
 * Generates an unguessable, URL-safe invitation token.
 *
 * 32 bytes of randomness encoded as base64url → 43 ASCII chars, well under the
 * column's 64-char cap. base64url avoids `+/=` so the token is safe in URL paths
 * without escaping.
 */
export const generateInvitationToken = (): string => randomBytes(32).toString('base64url');
