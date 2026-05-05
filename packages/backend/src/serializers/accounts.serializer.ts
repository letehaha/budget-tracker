/**
 * Account Serializers
 *
 * Serializes account model instances for API responses.
 * Money fields auto-convert via .toNumber().
 */
import { ACCOUNT_STATUSES, AccountShareInfo, BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { centsToApiDecimal } from '@common/types/money';
import type Accounts from '@models/accounts.model';
import type { AccountShareContext } from '@services/sharing/get-shared-accounts.service';

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
  /** Provider type denormalized from the connection so the frontend can render the
   *  bank logo without a per-account connection-details lookup (which is owner-scoped
   *  and unreachable for share recipients). */
  bankProviderType: BANK_PROVIDER_TYPE | null;
  needsRelink?: boolean;
  /** Present on user-facing list/detail responses; absent on internal serializations. */
  share?: AccountShareInfo;
}

// ============================================================================
// Serializers (DB → API)
// ============================================================================

/**
 * Serialize an account from DB format to API response
 */
export function serializeAccount(
  account: Accounts & {
    needsRelink?: boolean;
    _shareContext?: AccountShareContext;
    _bankProviderType?: BANK_PROVIDER_TYPE | null;
  },
): AccountApiResponse {
  // Owner-side bank-link metadata (externalId, externalData, connection FK) leaks PII —
  // IBAN, owner name/address, identification_hash — and owner-internal state to share
  // recipients, who have no use for it. bankProviderType stays so the recipient UI can
  // still render the bank logo.
  const isRecipient = account._shareContext !== undefined && !account._shareContext.isOwner;

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
    externalId: isRecipient ? null : (account.externalId ?? null),
    externalData: isRecipient ? null : (account.externalData ?? null),
    status: account.status,
    excludeFromStats: account.excludeFromStats,
    bankDataProviderConnectionId: isRecipient ? null : (account.bankDataProviderConnectionId ?? null),
    bankProviderType: account._bankProviderType ?? null,
  };

  if (account.needsRelink !== undefined) {
    response.needsRelink = account.needsRelink;
  }

  if (account._shareContext) {
    response.share = {
      isOwner: account._shareContext.isOwner,
      owner: account._shareContext.owner,
      permission: account._shareContext.permission,
      policy: account._shareContext.policy,
    };
  }

  return response;
}

/**
 * Serialize multiple accounts
 */
export function serializeAccounts(
  accounts: (Accounts & {
    needsRelink?: boolean;
    _shareContext?: AccountShareContext;
    _bankProviderType?: BANK_PROVIDER_TYPE | null;
  })[],
): AccountApiResponse[] {
  return accounts.map(serializeAccount);
}
