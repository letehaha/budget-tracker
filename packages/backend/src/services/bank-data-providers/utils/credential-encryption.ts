import { decryptToken, encryptToken } from '@common/utils/encryption';

/**
 * Encrypt credentials object for storage in database
 * @param credentials - Plain credentials object
 * @returns Encrypted string
 */
export function encryptCredentials(credentials: Record<string, unknown>): string {
  const json = JSON.stringify(credentials);
  return encryptToken(json);
}

/**
 * Decrypt credentials from database storage
 * @param encrypted - Encrypted credentials string
 * @returns Decrypted credentials object
 */
export function decryptCredentials(encrypted: string): Record<string, unknown> {
  const json = decryptToken(encrypted);
  return JSON.parse(json);
}
