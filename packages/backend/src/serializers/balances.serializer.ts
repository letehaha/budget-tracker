/**
 * Balance Serializers
 *
 * Serializes balance model instances for API responses.
 * Money fields auto-convert via .toNumber().
 */
import type Balances from '@models/Balances.model';

// ============================================================================
// Response Types
// ============================================================================

export interface BalanceApiResponse {
  id: number;
  date: Date;
  amount: number;
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
    amount: balance.amount.toNumber(),
    accountId: balance.accountId,
  };
}

/**
 * Serialize multiple balances
 */
export function serializeBalances(balances: Balances[]): BalanceApiResponse[] {
  return balances.map(serializeBalance);
}
