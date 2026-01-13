/**
 * Balance Serializers
 *
 * Handles conversion between internal cents representation and API decimal format.
 * - Serializers: DB (cents) → API (decimal)
 */
import { type DecimalAmount, asCents, toDecimal } from '@bt/shared/types';
import type Balances from '@models/Balances.model';

// ============================================================================
// Response Types (API format with DecimalAmount)
// ============================================================================

export interface BalanceApiResponse {
  id: number;
  date: Date;
  amount: DecimalAmount;
  accountId: number;
}

// ============================================================================
// Serializers (DB → API)
// ============================================================================

/**
 * Serialize a balance from DB format to API response
 */
export function serializeBalance(balance: Balances): BalanceApiResponse {
  return {
    id: balance.id,
    date: balance.date,
    amount: toDecimal(asCents(balance.amount)),
    accountId: balance.accountId,
  };
}

/**
 * Serialize multiple balances
 */
export function serializeBalances(balances: Balances[]): BalanceApiResponse[] {
  return balances.map(serializeBalance);
}
