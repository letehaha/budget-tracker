import { EventEmitter } from 'events';

/**
 * Event bus for domain events.
 * Allows decoupled communication between services.
 */
export const eventBus = new EventEmitter();

/**
 * Domain event names
 */
export const DOMAIN_EVENTS = {
  /**
   * Emitted when transactions are synced from a bank provider.
   * Payload: @type TransactionsSyncedPayload
   */
  TRANSACTIONS_SYNCED: 'transactions:synced',
} as const;

/**
 * Event payload types
 */
export interface TransactionsSyncedPayload {
  userId: number;
  accountId: number;
  transactionIds: number[];
}
