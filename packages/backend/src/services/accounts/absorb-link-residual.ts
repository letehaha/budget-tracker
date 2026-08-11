import { type AccountExternalData, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { UnexpectedError } from '@js/errors';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import { namespace } from '@models/connection';
import Transactions from '@models/transactions.model';
import { restampRefInitialBalance } from '@services/accounts/restamp-ref-initial-balance';
import { withTransaction } from '@services/common/with-transaction';
import { QueryTypes } from 'sequelize';

/**
 * Restores `initialBalance + Σsigned(tx) = currentBalance` after a post-link
 * sync force-wrote the bank balance. Only the opening balance moves: the bank
 * owns `currentBalance`, and the residual is history the provider never handed
 * us. Returns the absorbed residual in cents.
 */
export const absorbLinkResidualIntoOpeningBalance = withTransaction(
  async ({ accountId, userId }: { accountId: string; userId: number }): Promise<number> => {
    const sequelizeTx = namespace.get('transaction');

    // Lock before summing: a concurrent sync blocks on this row lock, so summing
    // first would pair a pre-sync ledger sum with a post-sync currentBalance and
    // absorb the concurrent delta into the opening balance.
    const account = await Accounts.findOne({
      where: { id: accountId, userId },
      transaction: sequelizeTx,
      lock: sequelizeTx?.LOCK.UPDATE,
    });
    if (!account) {
      logger.error(
        {
          message: 'Account missing when absorbing the post-link balance residual',
          error: new Error(`Accounts.findOne returned null for accountId=${accountId}`),
        },
        { code: 'ACCOUNT_LINK_RESIDUAL_ACCOUNT_MISSED', accountId, userId },
      );
      return 0;
    }

    const [row] = await Transactions.sequelize!.query<{ signedSum: string }>(
      `SELECT COALESCE(SUM(CASE WHEN "transactionType" = :incomeType THEN "amount" ELSE -"amount" END), 0) AS "signedSum"
       FROM "Transactions" WHERE "accountId" = :accountId`,
      {
        replacements: { accountId, incomeType: TRANSACTION_TYPES.income },
        type: QueryTypes.SELECT,
        transaction: sequelizeTx,
      },
    );

    const signedSumCents = Number(row?.signedSum ?? 0);
    const initialBalanceBefore = account.initialBalance;
    const identityGapCents = account.currentBalance.toCents() - (initialBalanceBefore.toCents() + signedSumCents);
    if (identityGapCents === 0) return 0;

    const initialBalanceAfter = initialBalanceBefore.add(Money.fromCents(identityGapCents));
    await Accounts.update({ initialBalance: initialBalanceAfter }, { where: { id: accountId, userId } });

    // A failed restamp would pair the moved opening balance with a stale
    // base-currency stamp; throw so the whole absorb rolls back.
    const restampOutcome = await restampRefInitialBalance({ accountId, allowProviderAccount: true });
    if (restampOutcome === 'failed') {
      throw new UnexpectedError({
        message:
          'Failed to restate the opening balance in the base currency; the link was not applied. Please try again.',
      });
    }

    // The restamp cascade shifts every Balances row, including today's, which the
    // sync pinned to the bank's authoritative balance. Re-pin it from the
    // post-restamp row.
    const restamped = await Accounts.findOne({ where: { id: accountId, userId }, transaction: sequelizeTx });
    if (restamped) {
      await Balances.setTodayRowToSpot({ account: restamped });
    } else {
      logger.error(
        {
          message: 'Account re-read after restampRefInitialBalance missed; the current-day balance row stays cascaded',
          error: new Error(`Accounts.findOne returned null for accountId=${accountId}`),
        },
        { code: 'ACCOUNT_LINK_RESIDUAL_REREAD_MISSED', accountId, userId },
      );
    }

    logger.info('Absorbed post-link balance residual into the opening balance', {
      accountId,
      userId,
      signedSumCents,
      identityGapCents,
      initialBalanceBeforeCents: initialBalanceBefore.toCents(),
      initialBalanceAfterCents: initialBalanceAfter.toCents(),
    });

    return identityGapCents;
  },
);

/**
 * Runs the absorb that linking deferred via `pendingAbsorb` (queue-synced
 * providers persist nothing inline, so no residual exists until the worker
 * finishes) and records the outcome in the reconciliation snapshot. Without
 * the marker it no-ops returning null, so it is safe after every sync group.
 */
export const runPendingLinkAbsorb = withTransaction(
  async ({ accountId, userId }: { accountId: string; userId: number }): Promise<number | null> => {
    const account = await Accounts.findOne({ where: { id: accountId, userId } });
    const externalData = (account?.externalData ?? {}) as AccountExternalData;
    const reconciliation = externalData.bankConnection?.balanceReconciliation;

    if (!account || !reconciliation?.pendingAbsorb) return null;

    const absorbedResidual = await absorbLinkResidualIntoOpeningBalance({ accountId, userId });

    // Re-read: the absorb rewrote initialBalance behind this instance.
    const fresh = await Accounts.findOne({ where: { id: accountId, userId } });
    if (!fresh) return absorbedResidual;

    const freshExternalData = (fresh.externalData ?? {}) as AccountExternalData;
    const freshConnectionMeta = freshExternalData.bankConnection;
    if (!freshConnectionMeta) return absorbedResidual;

    await fresh.update({
      externalData: {
        ...freshExternalData,
        bankConnection: {
          ...freshConnectionMeta,
          balanceReconciliation: {
            ...freshConnectionMeta.balanceReconciliation,
            pendingAbsorb: false,
            ...(absorbedResidual !== 0 ? { absorbedResidual } : {}),
          },
        },
      },
    });

    return absorbedResidual;
  },
);
