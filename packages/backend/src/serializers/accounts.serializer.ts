/**
 * Account Serializers
 *
 * Serializes account model instances for API responses.
 * Money fields auto-convert via .toNumber().
 */
import { ACCOUNT_STATUSES } from '@bt/shared/types';
import { centsToApiDecimal } from '@common/types/money';
import type Accounts from '@models/accounts.model';

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
  status: ACCOUNT_STATUSES;
  excludeFromStats: boolean;
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
    initialBalance: centsToApiDecimal(account.initialBalance),
    refInitialBalance: centsToApiDecimal(account.refInitialBalance),
    currentBalance: centsToApiDecimal(account.currentBalance),
    refCurrentBalance: centsToApiDecimal(account.refCurrentBalance),
    creditLimit: centsToApiDecimal(account.creditLimit),
    refCreditLimit: centsToApiDecimal(account.refCreditLimit),
    type: account.type,
    accountCategory: account.accountCategory,
    currencyCode: account.currencyCode,
    userId: account.userId,
    externalId: account.externalId ?? null,
    externalData: account.externalData ?? null,
    status: account.status,
    excludeFromStats: account.excludeFromStats,
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
