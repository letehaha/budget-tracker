/**
 * Monobank-specific types for the provider implementation
 */
import type { DeactivationReason } from '@bt/shared/types';

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
  /** Shared auth-failure tracking (written by the base provider). */
  consecutiveAuthFailures?: number;
  deactivationReason?: DeactivationReason | null;
}
