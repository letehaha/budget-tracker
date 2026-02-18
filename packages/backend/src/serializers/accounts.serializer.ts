/**
 * Account Serializers
 *
 * Serializes account model instances for API responses.
 * Money fields auto-convert via .toNumber().
 */
import { Money } from '@common/types/money';
import type Accounts from '@models/Accounts.model';

/**
 * Convert a money field to API decimal. Handles both:
 * - Money objects (from model instances) → .toNumber()
 * - Raw cents numbers (from raw: true queries) → cents / 100
 */
function centsToApi(val: Money | number): number {
  if (Money.isMoney(val)) return val.toNumber();
  return (val as number) / 100;
}

// ============================================================================
// Response Types
// ============================================================================

export interface AccountApiResponse {
  id: number;
  name: string;
  initialBalance: number;
  refInitialBalance: number;
  currentBalance: number;
  refCurrentBalance: number;
  creditLimit: number;
  refCreditLimit: number;
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
 */
export function serializeAccount(account: Accounts & { needsRelink?: boolean }): AccountApiResponse {
  const response: AccountApiResponse = {
    id: account.id,
    name: account.name,
    initialBalance: centsToApi(account.initialBalance),
    refInitialBalance: centsToApi(account.refInitialBalance),
    currentBalance: centsToApi(account.currentBalance),
    refCurrentBalance: centsToApi(account.refCurrentBalance),
    creditLimit: centsToApi(account.creditLimit),
    refCreditLimit: centsToApi(account.refCreditLimit),
    type: account.type,
    accountCategory: account.accountCategory,
    currencyCode: account.currencyCode,
    userId: account.userId,
    externalId: account.externalId ?? null,
    externalData: account.externalData ?? null,
    isEnabled: account.isEnabled,
    bankDataProviderConnectionId: account.bankDataProviderConnectionId ?? null,
  };

  if (account.needsRelink !== undefined) {
    response.needsRelink = account.needsRelink;
  }

  return response;
}

/**
 * Serialize multiple accounts
 */
export function serializeAccounts(accounts: (Accounts & { needsRelink?: boolean })[]): AccountApiResponse[] {
  return accounts.map(serializeAccount);
}
