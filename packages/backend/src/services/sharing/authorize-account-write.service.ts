import { RESOURCE_TYPES, SHARE_PERMISSIONS, SharePolicy, TRANSACTIONS_WRITE_SCOPES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { NotFoundError, Unauthorized, ValidationError } from '@js/errors';

import { type GrantedAccessResult, canUserAccessResource } from './can-user-access-resource.service';

interface AuthorizeAccountWriteParams {
  userId: number;
  accountId: number;
  /**
   * For update/delete: the existing transaction's creator userId. Omit for create
   * (the caller becomes the creator). When set and the recipient's policy is
   * `transactionsWriteScope: 'own'`, the caller must equal the creator or auth
   * fails with 401 — owners and recipients on `'all'` are unaffected.
   */
  txCreatorUserId?: number;
  /**
   * i18n key for the 404 path. Defaults to `accounts.accountNotFoundForTransaction`
   * (used by create); update/delete pass `transactions.transactionIdNotExist` so the
   * caller sees a transaction-shaped error rather than an account one.
   */
  notFoundMessageKey?: 'accounts.accountNotFoundForTransaction' | 'transactions.transactionIdNotExist';
}

interface AuthorizeAccountWriteResult {
  /** Caller owns the account. */
  isOwner: boolean;
  /**
   * UserId to scope owner-only lookups against (account row, category set). Equals
   * the caller for owners, the resource owner for recipients.
   */
  accountOwnerUserId: number;
  /** Recipient policy (null for owners). */
  policy: SharePolicy | null;
}

/**
 * Enforces the `transactionsWriteScope: 'own'` rule against a pre-fetched access
 * result. Owners and recipients on `'all'` pass through; recipients on `'own'` pass
 * only when they authored the transaction. Used by callers that already obtained the
 * access result via `getTransactionById` (so the auth lookup isn't run twice).
 *
 * Throws `Unauthorized` (401) on violation.
 */
export const assertOwnScopeOk = ({
  access,
  callerUserId,
  txCreatorUserId,
}: {
  access: GrantedAccessResult;
  callerUserId: number;
  txCreatorUserId?: number;
}): void => {
  if (access.isOwner) return;
  if (txCreatorUserId === undefined) return;
  if (access.policy?.transactionsWriteScope !== TRANSACTIONS_WRITE_SCOPES.own) return;
  if (txCreatorUserId === callerUserId) return;
  throw new Unauthorized({
    message: t({ key: 'transactions.notOwnTransaction' }),
  });
};

/**
 * Single auth gate for account-scoped write operations whose caller doesn't already
 * hold an access result. Used by transaction *create* (no prior fetch); update/delete
 * compose the same primitives via `getWritableTransactionById`, which fetches and
 * authorizes in one round-trip.
 *
 * Throws:
 *   - `NotFoundError` (404) when the caller has no claim on the account at all (or
 *     the account doesn't exist) — F3 "404 masks existence".
 *   - `Unauthorized` (401) when the caller is a recipient on `'own'` scope and isn't
 *     the transaction's creator.
 *
 * Owners always pass through.
 */
export const authorizeAccountWrite = async ({
  userId,
  accountId,
  txCreatorUserId,
  notFoundMessageKey = 'accounts.accountNotFoundForTransaction',
}: AuthorizeAccountWriteParams): Promise<AuthorizeAccountWriteResult> => {
  const access = await canUserAccessResource({
    userId,
    resourceType: RESOURCE_TYPES.account,
    resourceId: accountId,
    requiredPermission: SHARE_PERMISSIONS.write,
  });
  if (!access.granted) {
    throw new NotFoundError({ message: t({ key: notFoundMessageKey }) });
  }
  assertOwnScopeOk({ access, callerUserId: userId, txCreatorUserId });
  return {
    isOwner: access.isOwner,
    accountOwnerUserId: access.ownerUserId,
    policy: access.policy,
  };
};

interface SharedWritePhase1GuardsParams {
  isOwner: boolean;
  /** Operation creates, edits to/from, or deletes a transfer. */
  involvesTransfer?: boolean;
  /** Operation creates, edits, or implicitly removes a refund link. */
  involvesRefund?: boolean;
  /** Operation moves the transaction to a different account. */
  changesAccountId?: boolean;
}

/**
 * Phase-1 only: blocks recipient writes that cross account/user boundaries in ways
 * that need their own slices (transfer linking, refund linking, moving a tx between
 * accounts). Owners pass through unconditionally — only the recipient path is gated.
 *
 * Each follow-up slice (transfers-on-shared, refunds-on-shared, ...) drops the
 * matching flag from this helper rather than re-deriving the rule per service.
 */
export const assertSharedWritePhase1Guards = ({
  isOwner,
  involvesTransfer,
  involvesRefund,
  changesAccountId,
}: SharedWritePhase1GuardsParams): void => {
  if (isOwner) return;
  if (involvesTransfer) {
    throw new ValidationError({
      message: t({ key: 'transactions.sharedTransfersNotSupported' }),
    });
  }
  if (involvesRefund) {
    throw new ValidationError({
      message: t({ key: 'transactions.sharedRefundsNotSupported' }),
    });
  }
  if (changesAccountId) {
    throw new ValidationError({
      message: t({ key: 'transactions.sharedAccountChangeNotSupported' }),
    });
  }
};
