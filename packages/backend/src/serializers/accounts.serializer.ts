/**
 * Account Serializers
 *
 * Handles conversion between internal cents representation and API decimal format.
 * - Serializers: DB (cents) → API (decimal)
 * - Deserializers: API (decimal) → DB (cents)
 */
import {
  type AccountModel,
  type AccountWithRelinkStatus,
  type DecimalAmount,
  asCents,
  toDecimal,
} from '@bt/shared/types';

// ============================================================================
// Response Types (API format with DecimalAmount)
// ============================================================================

export interface AccountApiResponse {
  id: number;
  name: string;
  initialBalance: DecimalAmount;
  refInitialBalance: DecimalAmount;
  currentBalance: DecimalAmount;
  refCurrentBalance: DecimalAmount;
  creditLimit: DecimalAmount;
  refCreditLimit: DecimalAmount;
  type: string;
  accountCategory: string;
  currencyCode: string;
  userId: number;
  externalId: string | null;
  externalData: Record<string, unknown> | null;
  isEnabled: boolean;
  bankDataProviderConnectionId: number | null;
  needsRelink?: boolean;
}

// ============================================================================
// Serializers (DB → API)
// ============================================================================

/**
 * Serialize an account from DB format to API response
 * Accepts AccountModel, AccountWithRelinkStatus, or the Sequelize model
 */
export function serializeAccount(account: AccountModel | AccountWithRelinkStatus): AccountApiResponse {
  const response: AccountApiResponse = {
    id: account.id,
    name: account.name,
    initialBalance: toDecimal(asCents(account.initialBalance)),
    refInitialBalance: toDecimal(asCents(account.refInitialBalance)),
    currentBalance: toDecimal(asCents(account.currentBalance)),
    refCurrentBalance: toDecimal(asCents(account.refCurrentBalance)),
    creditLimit: toDecimal(asCents(account.creditLimit)),
    refCreditLimit: toDecimal(asCents(account.refCreditLimit)),
    type: account.type,
    accountCategory: account.accountCategory,
    currencyCode: account.currencyCode,
    userId: account.userId,
    externalId: account.externalId ?? null,
    externalData: account.externalData ?? null,
    isEnabled: account.isEnabled,
    bankDataProviderConnectionId: account.bankDataProviderConnectionId ?? null,
  };

  // Include needsRelink if present (from AccountWithRelinkStatus)
  if ('needsRelink' in account) {
    response.needsRelink = account.needsRelink;
  }

  return response;
}

/**
 * Serialize multiple accounts
 */
export function serializeAccounts(accounts: (AccountModel | AccountWithRelinkStatus)[]): AccountApiResponse[] {
  return accounts.map(serializeAccount);
}
