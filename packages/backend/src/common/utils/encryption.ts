import crypto from 'crypto';

const ENCRYPTION_SECRET = process.env.APPLICATION_JWT_SECRET!;
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_SECRET) {
  throw new Error('APPLICATION_JWT_SECRET is required for encryption');
}

// Derive a 32-byte key from any length secret using SHA-256
function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a token using AES-256-GCM with a key derived from APPLICATION_JWT_SECRET
 * @param token - The plaintext token to encrypt
 * @returns Encrypted token in format: iv:authTag:encryptedData
 */
export function encryptToken(token: string): string {
  const key = deriveKey(ENCRYPTION_SECRET);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a token encrypted with encryptToken
 * @param encryptedToken - The encrypted token string
 * @returns Decrypted plaintext token
 */
export function decryptToken(encryptedToken: string): string {
  const key = deriveKey(ENCRYPTION_SECRET);
  const [ivHex, authTagHex, encryptedData] = encryptedToken.split(':');

  if (!ivHex || !authTagHex || !encryptedData) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
