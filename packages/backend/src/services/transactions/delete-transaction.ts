import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { t } from '@i18n/index';
import { UnexpectedError, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import RefundTransactions from '@models/refund-transactions.model';
import * as Transactions from '@models/transactions.model';
import { deletePortfolioTransfer } from '@services/investments/portfolios/transfers';
import { assertSharedWritePhase1Guards } from '@services/sharing/auth/authorize-account-write.service';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';
import { getWritableTransactionById } from './get-by-id';

export const deleteTransaction = withTransaction(
  async ({ id, userId }: { id: string; userId: number }): Promise<void> => {
    try {
      // Single fetch + write-authorization gate. `getWritableTransactionById` throws 404
      // when the caller has no claim, 401 when scope: 'own' is violated. Returns a
      // pre-resolved `ctx` so the call site doesn't reassemble auth primitives.
      const { tx, ctx } = await getWritableTransactionById({ id, userId });
      const { accountType, transferNature, transferId, refundLinked } = tx;

      // Phase-1 guards block recipient deletes that cross into linking semantics
      // (transfers, refunds) — owners pass through and use the existing flows.
      assertSharedWritePhase1Guards({
        isOwner: ctx.isOwner,
        involvesTransfer:
          transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer ||
          transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio ||
          transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_venture,
        involvesRefund: Boolean(refundLinked),
      });

      if (accountType !== ACCOUNT_TYPES.system) {
        throw new ValidationError({
          message: t({ key: 'transactions.cannotDeleteExternal' }),
        });
      }

      if (refundLinked) {
        await unlinkRefundTransaction(id);
      }

      // The model's deleteTransactionById filters by `(id, userId)` — pass the row's
      // actual creator userId rather than the caller's so a recipient with `'all'`
      // scope can delete owner-authored rows after the auth gate above.
      const creatorUserId = tx.userId;

      if (
        transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer ||
        // Out of wallet transaction shouldn't have transferId
        (transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet && !transferId) ||
        // Venture-linked transactions are deleted directly; the venture event service
        // is responsible for unlinking its own VentureEventLink before calling this.
        transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_venture ||
        // Orphaned transfer leg: flagged as a common transfer but its pair is gone and
        // `transferId` was cleared. There's no twin to delete alongside it, so treat it
        // as a standalone row instead of falling through to the "unexpected" guard below.
        (transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer && !transferId)
      ) {
        await Transactions.deleteTransactionById({ id, userId: creatorUserId });
      } else if (transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio) {
        // Find linked portfolio transfer via PortfolioTransfers.transactionId
        const linkedTransfer = await PortfolioTransfers.findOne({
          where: { transactionId: id },
        });

        // Delete linked portfolio transfer (reverses portfolio balance) and the
        // account transaction together. Passing deleteLinkedTransaction: true tells
        // deletePortfolioTransfer to also remove the account transaction row.
        // Portfolio-transfer-on-shared-account is owner-only (recipients are blocked
        // above), so `userId` here is always both caller and creator.
        if (linkedTransfer) {
          await deletePortfolioTransfer({ userId, transferId: linkedTransfer.id, deleteLinkedTransaction: true });
        } else {
          await Transactions.deleteTransactionById({ id, userId: creatorUserId });
        }
      } else if (transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer && transferId) {
        // Find both legs of the pair by transferId only. Cross-user transfers (created
        // through a household share) have legs that live under different `userId`s, so a
        // userId-scoped lookup would silently orphan the partner row. The caller's
        // authorization is already gated above by `getWritableTransactionById` —
        // touching the linked twin is implicit transfer semantics.
        const transferTransactions = await Transactions.default.findAll({
          where: { transferId },
        });

        await Promise.all(
          transferTransactions.map((transferTx) =>
            Transactions.deleteTransactionById({
              id: transferTx.id,
              userId: transferTx.userId,
            }),
          ),
        );
      } else {
        logger.error(`Unexpected issue when tried to delete transaction with id ${id}`);
        throw new UnexpectedError({ message: t({ key: 'transactions.unexpectedDeleteIssue' }) });
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') {
        logger.error(e as Error);
      }
      throw e;
    }
  },
);

const unlinkRefundTransaction = withTransaction(async (id: string) => {
  const refundTx = await RefundTransactions.findOne({
    where: {
      [Op.or]: [{ originalTxId: id }, { refundTxId: id }],
    },
  });

  if (!refundTx) return undefined;

  const transactionIdsToUpdate = [refundTx.refundTxId, refundTx.originalTxId].filter((i) => Boolean(i) && i !== id);

  if (transactionIdsToUpdate.length) {
    await Transactions.default.update(
      { refundLinked: false },
      {
        where: {
          id: {
            [Op.in]: transactionIdsToUpdate,
          },
        },
      },
    );
  }
});
