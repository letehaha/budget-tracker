/**
 * JWT token generation utilities for Enable Banking API authentication
 * Enable Banking requires RS256 signed JWT tokens for all API calls
 */
import { logger } from '@js/utils';
import * as crypto from 'crypto';

import { EnableBankingJWTPayload } from './types';

/**
 * Base64 URL encode (without padding)
 */
function base64UrlEncode(data: string | Buffer): string {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Normalize private key to proper PEM format
 * Handles various input formats (with/without headers, escaped newlines, etc.)
 */
function normalizePrivateKey(privateKey: string): string {
  // Remove any leading/trailing whitespace
  let key = privateKey.trim();

  // If key doesn't have PEM headers, it might be base64 encoded body only
  if (!key.includes('BEGIN') && !key.includes('PRIVATE KEY')) {
    // Assume it's just the base64 part, add headers
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
  }

  // Handle escaped newlines (from JSON)
  key = key.replace(/\\n/g, '\n');

  // Ensure proper line breaks after headers
  key = key.replace(/-----BEGIN ([^-]+)-----([^\n])/g, '-----BEGIN $1-----\n$2');
  key = key.replace(/([^\n])-----END ([^-]+)-----/g, '$1\n-----END $2-----');

  // Ensure the key ends with a newline
  if (!key.endsWith('\n')) {
    key += '\n';
  }

  return key;
}

/**
 * Generate JWT token for Enable Banking API
 * @param appId - Application ID from Enable Banking portal (used as 'kid')
 * @param privateKey - PEM-encoded RSA private key
 * @param expiresInSeconds - Token validity duration (max 86400 = 24 hours)
 * @returns Signed JWT token
 */
export function generateJWT(
  appId: string,
  privateKey: string,
  expiresInSeconds: number = 3600, // Default: 1 hour
): string {
  // Ensure expiration doesn't exceed 24 hours
  const maxExpiration = 86400; // 24 hours
  const expiration = Math.min(expiresInSeconds, maxExpiration);

  const now = Math.floor(Date.now() / 1000);

  // JWT Header
  const header = {
    typ: 'JWT',
    alg: 'RS256',
    kid: appId,
  };

  // JWT Payload
  const payload: EnableBankingJWTPayload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + expiration,
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature input
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Normalize the private key format
  const normalizedKey = normalizePrivateKey(privateKey);

  // Sign with RS256
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  sign.end();

  const signature = sign.sign(normalizedKey);
  const encodedSignature = base64UrlEncode(signature);

  // Combine to create JWT
  return `${signatureInput}.${encodedSignature}`;
}

/**
 * Verify that a private key is valid PEM format
 * @param privateKey - PEM-encoded private key
 * @returns True if valid
 */
export function validatePrivateKey(privateKey: string): boolean {
  try {
    // Normalize the key first
    const normalizedKey = normalizePrivateKey(privateKey);

    // Try to create a key object to verify it's valid
    crypto.createPrivateKey(normalizedKey);
    return true;
  } catch (error) {
    logger.error({ message: 'Private key validation failed:', error: error as Error });
    return false;
  }
}

/**
 * Generate a random state parameter for OAuth CSRF protection
 * @param userId - User ID to include in state
 * @returns State string
 */
export function generateState(userId: number): string {
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${userId}-${timestamp}-${randomBytes}`;
}

/**
 * Validate OAuth state parameter
 * @param state - State from callback
 * @param expectedUserId - Expected user ID
 * @returns True if state is valid and matches user
 */
export function validateState(state: string, expectedUserId: number): boolean {
  try {
    const parts = state.split('-');
    if (parts.length < 3) return false;

    const userIdStr = parts[0];
    const timestampStr = parts[1];

    if (!userIdStr || !timestampStr) return false;

    const userId = parseInt(userIdStr, 10);
    const timestamp = parseInt(timestampStr, 10);

    // Check for invalid parsing
    if (isNaN(userId) || isNaN(timestamp)) return false;

    // Check user ID matches
    if (userId !== expectedUserId) return false;

    // Check timestamp is not too old (1 hour max)
    const maxAge = 60 * 60 * 1000; // 1 hour
    if (Date.now() - timestamp > maxAge) return false;

    return true;
  } catch (error) {
    return false;
  }
}
