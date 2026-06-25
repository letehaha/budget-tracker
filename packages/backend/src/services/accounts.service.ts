import type { RecordId } from '@bt/shared/types';
import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  AccountExternalData,
  BANK_PROVIDER_TYPE,
  TRANSACTION_TRANSFER_NATURE,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotFoundError, UnexpectedError, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import * as Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import Transactions from '@models/transactions.model';
import * as UsersCurrencies from '@models/users-currencies.model';
import Users from '@models/users.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import {
  cleanupAccountSharesInTx,
  notifyAccountDeleteRecipients,
  type AccountShareCleanupResult,
} from '@services/sharing/cleanup/cleanup-account-shares.service';
import {
  AccountShareContext,
  buildOwnerShareContext,
  getSharedAccountById,
  getSharedAccountsForUser,
} from '@services/sharing/get-shared-accounts.service';
import { convertCrossUserTransfersForAccountIds } from '@services/sharing/household/convert-cross-user-transfers.service';
import { Op } from 'sequelize';

import { archiveAccount as performArchiveSideEffects } from './accounts/archive-account';
import { withTransaction } from './common/with-transaction';

type AccountWithRelinkStatus = Accounts.default & {
  needsRelink?: boolean;
  _shareContext?: AccountShareContext;
  _bankProviderType?: BANK_PROVIDER_TYPE | null;
};

/**
 * Batch-load provider types for accounts that have a `bankDataProviderConnectionId` and
 * stamp `_bankProviderType` on each account in place. Lets the serializer expose the
 * provider type so the frontend can render the bank logo without a per-account
 * connection-details lookup (which is owner-scoped and unreachable for share recipients).
 */
async function attachBankProviderTypes(accounts: AccountWithRelinkStatus[]): Promise<void> {
  const connectionIds = Array.from(
    new Set(accounts.map((a) => a.bankDataProviderConnectionId).filter((id): id is RecordId => typeof id === 'string')),
  );
  if (!connectionIds.length) return;

  const connections = await BankDataProviderConnections.findAll({
    where: { id: { [Op.in]: connectionIds } },
    attributes: ['id', 'providerType'],
  });
  const providerTypeById = new Map(connections.map((c) => [c.id, c.providerType as BANK_PROVIDER_TYPE]));

  for (const account of accounts) {
    if (typeof account.bankDataProviderConnectionId === 'string') {
      account._bankProviderType = providerTypeById.get(account.bankDataProviderConnectionId) ?? null;
    }
  }
}

/**
 * Check if an Enable Banking account needs to be re-linked.
 * This is true when the account has rawAccountData with identification_hash,
 * but the externalId doesn't match (meaning it was created with uid instead).
 */
function checkNeedsRelink(account: Accounts.default): boolean {
  // Only check accounts linked to a bank connection
  if (!account.bankDataProviderConnectionId) return false;

  switch (account.type) {
    case ACCOUNT_TYPES.enableBanking: {
      const externalData = account.externalData as AccountExternalData | null;
      if (!externalData) {
        // No externalData means very old account created before we stored raw data
        return true;
      }

      const rawAccountData = externalData.rawAccountData as { identification_hash?: string } | undefined;
      if (!rawAccountData?.identification_hash) {
        // No identification_hash means that account uses old schema – need to be updated
        return true;
      }

      // Account needs re-link if externalId doesn't match the stable identification_hash
      return account.externalId !== rawAccountData.identification_hash;
    }
    default:
      return false;
  }
}

/**
 * Add needsRelink flag to accounts.
 * Uses Object.assign (not spread) to preserve the Sequelize model prototype and Money getters.
 */
function addNeedsRelinkFlag(accounts: Accounts.default[]): AccountWithRelinkStatus[] {
  return accounts.map((account) =>
    Object.assign(account, {
      needsRelink: checkNeedsRelink(account),
    }),
  );
}

/**
 * User-facing account list. Returns the caller's owned accounts plus any accounts that
 * have been shared with them (accepted shares only). Each item carries a `_shareContext`
 * marker that the serializer turns into the public `share` block.
 *
 * Internal callers that should remain owner-scoped (e.g. balance recalculation) must use
 * the model-level `Accounts.getAccountById` / `Accounts.getAccounts` directly.
 */
export const getAccounts = withTransaction(
  async (payload: Accounts.GetAccountsPayload): Promise<AccountWithRelinkStatus[]> => {
    const ownedRaw = await Accounts.getAccounts(payload);
    const ownedWithRelink = addNeedsRelinkFlag(ownedRaw);

    const ownerUser = ownedWithRelink.length ? await Users.findByPk(payload.userId) : null;
    if (ownedWithRelink.length && !ownerUser) {
      // Authenticated caller owns accounts but has no Users row — should never happen
      // (auth middleware guarantees it). Without the row we can't stamp _shareContext and
      // the serializer silently omits the `share` block, which the frontend uses to
      // distinguish owner vs recipient UI. Surface so this doesn't degrade silently.
      logger.error(
        {
          message: 'Authenticated user not found when building owner share context',
          error: new Error(`Users.findByPk returned null for userId=${payload.userId}`),
        },
        { code: 'ACCOUNTS_OWNER_USER_MISSING', userId: payload.userId },
      );
    }
    const ownerContext = ownerUser ? await buildOwnerShareContext({ ownerUser }) : null;

    const owned = ownedWithRelink.map((account) =>
      ownerContext ? Object.assign(account, { _shareContext: ownerContext }) : account,
    );

    const shared = await getSharedAccountsForUser({ userId: payload.userId, type: payload.type });
    // Shared instances aren't passed through `addNeedsRelinkFlag` because non-owners
    // shouldn't see relink state for someone else's bank-linked account.
    const all = [...owned, ...shared];
    await attachBankProviderTypes(all);
    return all;
  },
);

export const getAccountById = withTransaction(
  async (payload: { id: string; userId: number }): Promise<AccountWithRelinkStatus | null> => {
    const owned = await Accounts.getAccountById({ ...payload });

    if (owned) {
      const enriched = Object.assign(owned, { needsRelink: checkNeedsRelink(owned) }) as AccountWithRelinkStatus;
      const ownerUser = await Users.findByPk(payload.userId);
      if (ownerUser) {
        enriched._shareContext = await buildOwnerShareContext({ ownerUser });
      } else {
        // Same integrity-violation signal as `getAccounts` — caller owns this account
        // but has no Users row. Without _shareContext the recipient-vs-owner serializer
        // branch breaks; log so silent UI degradation is visible to ops.
        logger.error(
          {
            message: 'Authenticated user not found when building owner share context for account by id',
            error: new Error(`Users.findByPk returned null for userId=${payload.userId}`),
          },
          { code: 'ACCOUNTS_OWNER_USER_MISSING', userId: payload.userId, accountId: payload.id },
        );
      }
      await attachBankProviderTypes([enriched]);
      return enriched;
    }

    // Fall through to shared lookup; returns null if the caller has no accepted share.
    const shared = await getSharedAccountById({ userId: payload.userId, id: payload.id });
    if (shared) await attachBankProviderTypes([shared]);
    return shared;
  },
);

export const createAccount = withTransaction(
  async (
    payload: Omit<Accounts.CreateAccountPayload, 'refCreditLimit' | 'refInitialBalance'>,
  ): Promise<Accounts.default | null> => {
    try {
      const { userId, creditLimit, currencyCode, initialBalance } = payload;

      await UsersCurrencies.addCurrency({ userId, currencyCode });

      const refCreditLimit = await calculateRefAmount({
        userId: userId,
        amount: creditLimit,
        baseCode: currencyCode,
        date: new Date(),
      });

      const refInitialBalance = await calculateRefAmount({
        userId,
        amount: initialBalance,
        baseCode: currencyCode,
        date: new Date(),
      });

      return Accounts.createAccount({
        ...payload,
        refCreditLimit,
        refInitialBalance,
      });
    } catch (e) {
      logger.error(
        { message: 'Failed to create account', error: e as Error },
        { code: 'ACCOUNT_CREATE_FAILED', userId: payload.userId, currencyCode: payload.currencyCode },
      );
      throw e;
    }
  },
);

export const updateAccount = withTransaction(
  async ({
    id,
    externalId,
    loanBalanceCorrection,
    ...payload
  }: Accounts.UpdateAccountByIdPayload &
    (Pick<Accounts.UpdateAccountByIdPayload, 'id'> | Pick<Accounts.UpdateAccountByIdPayload, 'externalId'>) & {
      /**
       * Internal opt-in that authorises a loan's `currentBalance` write. Set only
       * by `updateLoan`'s balance_correction path; destructured out here so it is
       * never forwarded to `Accounts.updateAccountById` (it is not a column). The
       * HTTP controller forwards a fixed field allowlist, so a client cannot set it.
       */
      loanBalanceCorrection?: boolean;
    }) => {
    const accountData = await findOrThrowNotFound({
      query: Accounts.getAccountById({ id, userId: payload.userId }),
      message: t({ key: 'accounts.accountNotFound' }),
    });

    // A vehicle's value is owned by the depreciation model + override flow.
    // Setting `currentBalance` here (directly, no adjustment transaction) would
    // leave `Vehicle.valueAnchor` stale, so the next lazy refresh would silently
    // overwrite the edit. Enforced in the service — not just the controller — so
    // non-HTTP callers (MCP tools, internal services) can't bypass it; value
    // changes must go through the override flow (`POST /vehicles/:id/value`).
    if (accountData.accountCategory === ACCOUNT_CATEGORIES.vehicle && payload.currentBalance !== undefined) {
      throw new ValidationError({
        message: t({ key: 'balanceAdjustment.vehicleUseOverride' }),
      });
    }

    // A loan's outstanding balance is reconciled by the dedicated loan flow,
    // which negates to the negative-cents liability convention and appends a
    // `balance_correction` timeline event (the only record of a manual edit,
    // since it leaves no transaction trail). A raw `currentBalance` write here
    // would skip both, desyncing the projection's paidToDate from the recorded
    // history. Only `updateLoan` may opt in via `loanBalanceCorrection`; every
    // other caller — including the generic PATCH /accounts/:id endpoint — must
    // go through `PATCH /loans/:id`. Enforced in the service so non-HTTP callers
    // (MCP tools, internal services) can't bypass it either.
    if (accountData.accountCategory === ACCOUNT_CATEGORIES.loan) {
      if (payload.currentBalance !== undefined && !loanBalanceCorrection) {
        throw new ValidationError({
          message: t({ key: 'accounts.loanBalanceUseUpdateLoan' }),
        });
      }
      // Flipping a loan out of the 'loan' category would orphan its LoanDetails
      // sidecar (and the events/projection it carries), so the category is
      // immutable here — loans are created/destroyed via the /loans endpoints.
      if (payload.accountCategory !== undefined && payload.accountCategory !== ACCOUNT_CATEGORIES.loan) {
        throw new ValidationError({
          message: t({ key: 'accounts.loanCategoryImmutable' }),
        });
      }
    }

    // Handle archive side effects when transitioning to archived status
    const isArchiving =
      payload.status === ACCOUNT_STATUSES.archived && accountData.status !== ACCOUNT_STATUSES.archived;
    if (isArchiving) {
      await performArchiveSideEffects({ account: accountData, userId: accountData.userId });
    }

    const currentBalanceIsChanging =
      payload.currentBalance !== undefined && !payload.currentBalance.equals(accountData.currentBalance);
    let initialBalance: Money = accountData.initialBalance;
    let refInitialBalance: Money = accountData.refInitialBalance;
    let refCurrentBalance: Money = accountData.refCurrentBalance;

    /**
     * If `currentBalance` is changing, it means user want to change current balance
     * but without creating adjustment transaction, so instead we change both `initialBalance`
     * and `currentBalance` on the same diff
     */
    if (currentBalanceIsChanging) {
      const diff = payload.currentBalance!.subtract(accountData.currentBalance);
      const refDiff = await calculateRefAmount({
        userId: accountData.userId,
        amount: diff,
        baseCode: accountData.currencyCode,
        date: new Date(),
      });

      // --- for system accounts
      // change currentBalance => change initialBalance
      // change currentBalance => recalculate refInitialBalance
      // --- for all accounts
      // change currentBalance => recalculate refCurrentBalance
      if (accountData.type === ACCOUNT_TYPES.system) {
        initialBalance = initialBalance.add(diff);
        refInitialBalance = refInitialBalance.add(refDiff);
      }
      refCurrentBalance = refCurrentBalance.add(refDiff);
    }

    // When credit limit changes, recalculate refCreditLimit for the new value.
    // Credit limit is separate from balance — it doesn't affect currentBalance
    // or refCurrentBalance. The display layer handles the visual impact via
    // `displayBalance = currentBalance - creditLimit`.
    const creditLimitIsChanging =
      payload.creditLimit !== undefined && !payload.creditLimit.equals(accountData.creditLimit);
    let adjustedRefCreditLimit: Money | undefined;

    if (creditLimitIsChanging) {
      adjustedRefCreditLimit = await calculateRefAmount({
        userId: accountData.userId,
        amount: payload.creditLimit!,
        baseCode: accountData.currencyCode,
        date: new Date(),
      });
    }

    const result = await Accounts.updateAccountById({
      id,
      externalId,
      ...payload,
      initialBalance,
      refInitialBalance,
      refCurrentBalance,
      ...(adjustedRefCreditLimit !== undefined ? { refCreditLimit: adjustedRefCreditLimit } : {}),
    });

    if (!result) {
      throw new UnexpectedError({ message: t({ key: 'accounts.accountUpdateFailed' }) });
    }

    await Balances.handleAccountChange({
      account: result,
      prevAccount: accountData,
    });

    return result;
  },
);

interface DeleteAccountByIdInTxResult {
  affectedRows: number;
  cleanup: AccountShareCleanupResult;
  /** Snapshotted before destroy so the post-commit notification copy can still reference
   *  the account name after the row is gone. */
  accountSnapshot: { id: string; name: string };
}

const deleteAccountByIdInTx = withTransaction(
  async ({ id, userId }: { id: string; userId: number }): Promise<DeleteAccountByIdInTxResult> => {
    const account = await Accounts.default.findOne({ where: { id, userId } });
    if (!account) {
      throw new NotFoundError({ message: t({ key: 'accounts.accountNotFound' }) });
    }

    // Cascading the destroy would wipe the source-leg expense rows for any
    // loan payments made from this account, which the model hooks would treat
    // as a reversal and silently restore the loan's owed balance back to its
    // disbursement value. Block until the user clears those payments first.
    const loanPaymentCount = await Transactions.count({
      where: { accountId: id, userId, transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan },
    });
    if (loanPaymentCount > 0) {
      throw new ValidationError({
        message: t({ key: 'accounts.deleteBlockedByLoanPayments' }),
      });
    }

    // Sharing cleanup runs in the same transaction so a destroy failure rolls back the
    // share row deletes and invitation revocations atomically.
    const cleanup = await cleanupAccountSharesInTx({ accountId: id, ownerUserId: userId });

    // Convert cross-user transfer pairs BEFORE the destroy so the partner leg (on the
    // OTHER user's account) isn't left orphaned with a `transferId` pointing at the
    // about-to-be-cascaded leg on this account. Same transaction as the destroy, so a
    // failure rolls everything back together.
    await convertCrossUserTransfersForAccountIds({ accountIds: [id], ownerUserId: userId });

    const affectedRows = await Accounts.deleteAccountById({ id, userId });
    if (affectedRows === 0) {
      // Defensive: the findOne above succeeded, so a 0-affectedRows here is a concurrency
      // anomaly (someone else deleted the row between the two queries). Treat it as a 404
      // for the caller so the response stays consistent.
      throw new NotFoundError({ message: t({ key: 'accounts.accountNotFound' }) });
    }

    return {
      affectedRows,
      cleanup,
      accountSnapshot: { id: account.id, name: account.name },
    };
  },
);

export const deleteAccountById = async ({ id, userId }: { id: string; userId: number }) => {
  const result = await deleteAccountByIdInTx({ id, userId });

  // Post-commit fan-out: the durable changes (share rows deleted, invitations revoked,
  // account row destroyed) committed in the transaction above. Notifications are
  // best-effort — a transient notify failure must not re-open the deleted account.
  if (result.cleanup.recipients.length > 0 || result.cleanup.householdRecipients.length > 0) {
    const owner = await Users.findByPk(userId);
    await notifyAccountDeleteRecipients({
      recipients: result.cleanup.recipients,
      householdRecipients: result.cleanup.householdRecipients,
      owner,
      account: result.accountSnapshot,
    });
  }

  return result.affectedRows;
};

export { unlinkAccountFromBankConnection } from './accounts/unlink-from-bank-connection';
export { linkAccountToBankConnection } from './accounts/link-to-bank-connection';
