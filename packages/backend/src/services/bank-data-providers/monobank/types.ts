/**
 * Monobank-specific types for the provider implementation
 */

/**
 * Monobank API credentials required for authentication
 */
export interface MonobankCredentials {
  /** Monobank API token (X-Token header) */
  apiToken: string;
}

/**
 * Monobank connection metadata stored alongside credentials
 */
export interface MonobankMetadata {
  /** Monobank client ID */
  clientId: string;
  /** Webhook URL if configured */
  webHookUrl?: string;
  /** User's name from Monobank */
  userName?: string;
}
