import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  isTwoLegTransfer,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import { logger } from '@js/utils/logger';
import * as Accounts from '@models/accounts.model';
import Categories from '@models/categories.model';
import Payees from '@models/payees.model';
import RefundTransactions from '@models/refund-transactions.model';
import Tags from '@models/tags.model';
import { deleteSplitsForTransaction } from '@models/transaction-splits.model';
import * as Transactions from '@models/transactions.model';
import * as UsersCurrencies from '@models/users-currencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { DOMAIN_EVENTS, eventBus } from '@services/common/event-bus';
import { assertLoanPaymentAllowed } from '@services/loans/assert-loan-payment-allowed';
import {
  assertSharedWritePhase1Guards,
  assertTxWriteAccess,
} from '@services/sharing/auth/authorize-account-write.service';
import { ensureUserCurrencyConnected } from '@services/sharing/auth/ensure-currency-connected.service';
import * as refundsService from '@services/tx-refunds';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';
import { calcTransferTransactionRefAmount, createOppositeTransaction } from './create-transaction';
import { getWritableTransactionById } from './get-by-id';
import { manageSplits } from './splits';
import { linkTransactions } from './transactions-linking';
import { type UpdateTransactionParams } from './types';

/**
 * Resolved auth context computed once at the top of `updateTransaction`. Threaded into
 * helpers so that account/category lookups go against the *owner* and DB writes filter
 * by the *creator* (`prevData.userId`) — not the caller — when a recipient is editing
 * a shared-account transaction.
 */
interface UpdateAuthContext {
  callerUserId: number;
  accountOwnerUserId: number;
  txCreatorUserId: number;
  isOwner: boolean;
}

export const EXTERNAL_ACCOUNT_RESTRICTED_UPDATION_FIELDS = ['amount', 'time', 'transactionType', 'accountId'];

/**
 * 1. Do not allow editing specified fields
 * 2. Do now allow editing non-source transaction (TODO: except it's an external one)
 */
const validateTransaction = async (
  newData: UpdateTransactionParams,
  prevData: Transactions.default,
  ctx: UpdateAuthContext,
) => {
  if (newData.id !== prevData.id) throw new ValidationError({ message: t({ key: 'transactions.idCannotBeChanged' }) });

  // Check the account type, not the transaction type
  // A system transaction in a monobank account should be treated as external.
  // Auth has already been gated by the parent `updateTransaction`, so we look up the
  // account against the *owner's* userId (which equals the caller for owned txs).
  const account = await findOrThrowNotFound({
    query: Accounts.getAccountById({
      userId: ctx.accountOwnerUserId,
      id: prevData.accountId,
    }),
    message: t({ key: 'accounts.accountNotFoundForTransaction' }),
  });

  const isExternalAccount = account.type !== ACCOUNT_TYPES.system;

  if (isExternalAccount) {
    if (EXTERNAL_ACCOUNT_RESTRICTED_UPDATION_FIELDS.some((field) => newData[field] !== undefined)) {
      throw new ValidationError({
        message: t({ key: 'transactions.editReadonlyFields' }),
      });
    }
  }

  if (newData.transactionType && isExternalAccount && newData.transactionType !== prevData.transactionType) {
    throw new ValidationError({
      message: t({ key: 'transactions.changeTypeNotAllowed' }),
    });
  }

  if (newData.refundedByTxIds !== undefined && newData.refundsTxId !== undefined) {
    throw new ValidationError({
      message: t({ key: 'transactions.bothRefundFieldsNotAllowed' }),
    });
  }

  if (
    prevData.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio ||
    prevData.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_venture
  ) {
    throw new ValidationError({
      message: t({ key: 'transactions.cannotEditPortfolioLinkedTransaction' }),
    });
  }

  // The transfer kind is frozen once a pair exists: relabeling a live pair
  // (common_transfer ↔ transfer_to_loan) would require restamping both legs
  // atomically and re-validating the destination's category. The supported
  // flow is unlink first (nature → not_transfer), then mark the expense again —
  // the re-mark goes through the create path, which stamps both legs and
  // validates the loan destination.
  if (
    newData.transferNature !== undefined &&
    isTwoLegTransfer(prevData.transferNature) &&
    isTwoLegTransfer(newData.transferNature) &&
    newData.transferNature !== prevData.transferNature
  ) {
    throw new ValidationError({
      message: t({ key: 'transactions.transferNatureChangeNotAllowed' }),
    });
  }

  // Loan invariants for edits touching the destination leg — keyed off the
  // destination account's *category*, not the nature label (mirrors
  // createOppositeTransaction). A frozen-nature pair can't be re-pointed to a
  // different loan; the supported flow is unlink first, then re-mark.
  const effectiveNature = newData.transferNature ?? prevData.transferNature;
  if (
    isTwoLegTransfer(prevData.transferNature) &&
    prevData.transferId &&
    (newData.destinationAmount !== undefined || newData.destinationAccountId !== undefined)
  ) {
    const oppositeLeg = await Transactions.default.findOne({
      where: { transferId: prevData.transferId, id: { [Op.ne]: prevData.id } },
      attributes: ['id', 'accountId', 'amount'],
    });
    if (oppositeLeg) {
      const destinationAccountId = newData.destinationAccountId ?? oppositeLeg.accountId;
      const isSameDestination = destinationAccountId === oppositeLeg.accountId;

      // Category-only read, deliberately not scoped by userId: on a shared
      // cross-user pair the opposite leg can live on another user's account,
      // and an owner-scoped lookup would 404 a plain amount edit. Ownership
      // is still enforced where it matters — `assertLoanPaymentAllowed`
      // locks the loan row by (id, ownerUserId), and a re-pointed
      // destination is ownership-checked downstream in
      // `updateTransferTransaction`'s currency lookup.
      const destAccount = await Accounts.default.findOne({
        where: { id: destinationAccountId },
        attributes: ['accountCategory'],
      });
      if (!destAccount) {
        throw new NotFoundError({ message: t({ key: 'accounts.accountNotFoundForTransaction' }) });
      }
      const isLoanDestination = destAccount.accountCategory === ACCOUNT_CATEGORIES.loan;

      if (effectiveNature === TRANSACTION_TRANSFER_NATURE.transfer_to_loan && !isLoanDestination) {
        throw new ValidationError({
          message: t({ key: 'transactions.transferToLoanRequiresLoanDestination' }),
        });
      }
      if (effectiveNature !== TRANSACTION_TRANSFER_NATURE.transfer_to_loan && isLoanDestination && !isSameDestination) {
        throw new ValidationError({
          message: t({ key: 'transactions.transferToLoanRelinkRequired' }),
        });
      }
      if (isLoanDestination) {
        await assertLoanPaymentAllowed({
          ownerUserId: ctx.accountOwnerUserId,
          loanAccountId: destinationAccountId,
          newLegAmount: newData.destinationAmount ?? oppositeLeg.amount,
          // The old leg is part of this loan's balance only when the
          // destination stays put; on a re-point the new loan never saw it.
          currentLegAmount: isSameDestination ? oppositeLeg.amount : null,
        });
      }
    }
  }

  // We doesn't allow users to change non-source trasnaction for several reasons:
  // 1. Most importantly – to make things simpler. For now there's no case that
  //    exactly non-source tx should be changed, so it's just easier to not
  //    code that logic
  // 2. To keep `refAmount` calculation correct abd be tied exactly to source tx.
  //    Otherwise we will need to code additional logic to handle that
  // For now keep that logic only for system transactions
  // if (
  //   prevData.accountType === ACCOUNT_TYPES.system &&
  //   prevData.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer &&
  //   prevData.transactionType !== TRANSACTION_TYPES.expense
  // ) {
  //   throw new ValidationError({
  //     message: 'You cannot edit non-primary transfer transaction',
  //   });
  // }
};

const makeBasicBaseTxUpdation = async (
  newData: UpdateTransactionParams,
  prevData: Transactions.default,
  ctx: UpdateAuthContext,
) => {
  const { currency: defaultUserCurrency } = await UsersCurrencies.getCurrency({
    userId: ctx.callerUserId,
    isDefaultCurrency: true,
  });

  // Check the account type, not the transaction type
  const account = await Accounts.getAccountById({
    userId: ctx.accountOwnerUserId,
    id: prevData.accountId,
  });

  const isSystemAccount = account?.type === ACCOUNT_TYPES.system;

  // Never update "transactionType" of non-system transactions. Just an additional guard
  const transactionType = isSystemAccount ? newData.transactionType : prevData.transactionType;

  const baseTransactionUpdateParams: Transactions.UpdateTransactionByIdParams & {
    amount: Money;
    refAmount: Money;
    currencyCode: string;
    time: Date;
  } = {
    id: newData.id,
    amount: newData.amount !== undefined ? newData.amount : prevData.amount,
    refAmount: newData.amount !== undefined ? newData.amount : prevData.refAmount,
    note: newData.note,
    time: newData.time ?? prevData.time,
    // The where-clause filter on Transactions.update needs the *creator's* userId
    // (the row's actual `userId`), not the caller. They differ when a recipient
    // edits an owner-created transaction with `transactionsWriteScope: 'all'`.
    userId: ctx.txCreatorUserId,
    transactionType,
    paymentType: newData.paymentType,
    accountId: newData.accountId,
    categoryId: newData.categoryId,
    transferNature: newData.transferNature,
    currencyCode: prevData.currencyCode,
    refundLinked: prevData.refundLinked,
  };

  // Manual Payee assign/clear from the UI also implicitly locks the row so
  // future provider syncs won't revert it. The controller can still pass
  // `payeeLocked` explicitly for transfer-conversion flows.
  //
  // Validate non-null payeeId against the *account owner*, mirroring the
  // category-scoping pattern (see `categoryId` lookup above). Payees are
  // owned by the account holder, so on a shared-account write the recipient
  // must pick from the owner's payee list. The DB FK only references
  // `Payees(id)` — without this scope check a caller could stamp a foreign
  // Payee onto an owner's row.
  if (newData.payeeId !== undefined) {
    if (newData.payeeId !== null) {
      const ownedPayee = await Payees.findOne({
        where: { id: newData.payeeId, userId: ctx.accountOwnerUserId },
        attributes: ['id'],
      });
      if (!ownedPayee) {
        throw new NotFoundError({ message: t({ key: 'payees.notFound' }) });
      }
    }
    baseTransactionUpdateParams.payeeId = newData.payeeId;
    baseTransactionUpdateParams.payeeLocked = true;
  }
  if (newData.payeeLocked !== undefined) {
    baseTransactionUpdateParams.payeeLocked = newData.payeeLocked;
  }

  const isBaseTxAccountChanged = newData.accountId && newData.accountId !== prevData.accountId;

  if (isBaseTxAccountChanged) {
    // Since accountId is changed, we need to change currency too. The destination
    // account's owner equals the caller in the owner case (the only case where
    // changing accountId is allowed in Phase 1; recipients are blocked at the entry).
    const { currency: baseTxCurrency } = await Accounts.getAccountCurrency({
      userId: ctx.callerUserId,
      id: newData.accountId!,
    });

    baseTransactionUpdateParams.currencyCode = baseTxCurrency.code;
  }

  if (defaultUserCurrency.code !== baseTransactionUpdateParams.currencyCode) {
    baseTransactionUpdateParams.refAmount = await calculateRefAmount({
      userId: newData.userId,
      amount: baseTransactionUpdateParams.amount,
      baseCode: baseTransactionUpdateParams.currencyCode,
      quoteCode: defaultUserCurrency.code,
      date: baseTransactionUpdateParams.time,
    });
  }

  const removeRefunds = (refunds: RefundTransactions[]) =>
    Promise.all(
      refunds.map((refund) =>
        refundsService.removeRefundLink({
          originalTxId: refund.originalTxId,
          refundTxId: refund.refundTxId,
          userId: newData.userId,
        }),
      ),
    );

  // Track pending refund operations to execute AFTER transaction update
  // This ensures createSingleRefund validates against the NEW refAmount
  let pendingRefundOperation: (() => Promise<void>) | null = null;

  if (newData.refundedByTxIds !== undefined) {
    const refundsShouldBeRemoved = prevData.refundLinked && newData.refundedByTxIds === null;
    const refundsShouldBeSetOrOverriden = Array.isArray(newData.refundedByTxIds) && newData.refundedByTxIds.length;

    if (refundsShouldBeRemoved || refundsShouldBeSetOrOverriden) {
      // Remove old refunds first (before update)
      const previousRefunds = await refundsService.getRefundsForTransactionById({
        userId: newData.userId,
        transactionId: newData.id,
      });
      await removeRefunds(previousRefunds);

      if (refundsShouldBeRemoved) baseTransactionUpdateParams.refundLinked = false;
      if (refundsShouldBeSetOrOverriden) {
        const newTransactions = await Transactions.default.findAll({
          where: {
            userId: newData.userId,
            id: {
              [Op.in]: newData.refundedByTxIds,
            },
          },
          attributes: ['refAmount'],
        });
        const sum = Money.sum(newTransactions.map((curr) => curr.refAmount));

        if (sum.greaterThan(baseTransactionUpdateParams.refAmount)) {
          throw new ValidationError({
            message: t({ key: 'transactions.refundExceedsOriginal' }),
          });
        }

        baseTransactionUpdateParams.refundLinked = true;
        // Defer refund creation until after transaction is updated
        pendingRefundOperation = async () => {
          await Promise.all(
            newData.refundedByTxIds!.map((id) =>
              refundsService.createSingleRefund({
                originalTxId: newData.id,
                refundTxId: id,
                userId: newData.userId,
              }),
            ),
          );
        };
      }
    }
  } else if (newData.refundsTxId !== undefined) {
    const refundShouldBeRemoved = prevData.refundLinked && newData.refundsTxId === null;
    const refundShouldBeSetOrOverriden = newData.refundsTxId;

    if (refundShouldBeRemoved || refundShouldBeSetOrOverriden) {
      // Remove old refunds first (before update)
      const previousRefunds = await refundsService.getRefundsForTransactionById({
        userId: newData.userId,
        transactionId: newData.id,
      });
      await removeRefunds(previousRefunds);

      if (refundShouldBeRemoved) baseTransactionUpdateParams.refundLinked = false;
      if (refundShouldBeSetOrOverriden) {
        baseTransactionUpdateParams.refundLinked = true;
        // Defer refund creation until after transaction is updated
        pendingRefundOperation = async () => {
          await refundsService.createSingleRefund({
            originalTxId: newData.refundsTxId!,
            refundTxId: newData.id,
            userId: newData.userId,
            splitId: newData.refundsSplitId ?? undefined,
          });
        };
      }
    }
  }

  // Update the transaction first
  const baseTransaction = await Transactions.updateTransactionById(baseTransactionUpdateParams);

  // Now create refund links (validates against the UPDATED refAmount)
  if (pendingRefundOperation) {
    await pendingRefundOperation();
  }

  return baseTransaction;
};

type HelperFunctionsArgs = [UpdateTransactionParams, Transactions.default, Transactions.default];

/**
 * If previously the base tx was transfer, we need to:
 *
 * 1. Find opposite tx to get access to old tx data
 * 2. Update opposite tx data
 */
const updateTransferTransaction = async (params: HelperFunctionsArgs) => {
  const [newData, prevData] = params;
  let [, , baseTransaction] = params;

  const { userId, destinationAmount, note, time, paymentType, destinationAccountId, categoryId } = newData;

  // Orphaned transfer leg: flagged as a transfer but `transferId` was cleared, so it has
  // no pair to update. Querying `findAll({ transferId: null })` would match every other
  // null-transferId row in the DB and pick a bogus "opposite" (which then trips the auth
  // gate below and surfaces as a misleading "opposite not found"). Skip opposite handling
  // and keep just the base update that already ran upstream.
  if (!prevData.transferId) {
    return { baseTx: baseTransaction, oppositeTx: undefined };
  }

  // Fetch the opposite without a userId filter — on a shared-account transfer, the two
  // sides can belong to different users (recipient links owner-authored tx with their own).
  // The auth gate immediately below verifies the caller has `write` on the opposite's
  // parent account before any mutation runs.
  const oppositeTx = (
    await Transactions.default.findAll({
      where: { transferId: prevData.transferId },
    })
  ).find((item) => item.id !== newData.id);

  if (!oppositeTx) {
    throw new NotFoundError({
      message: t({ key: 'transactions.oppositeTransactionNotFound' }),
    });
  }

  await assertTxWriteAccess({
    userId,
    tx: oppositeTx,
    notFoundKey: 'transactions.oppositeTransactionNotFound',
  });

  let updateOppositeTxParams = removeUndefinedKeys({
    id: oppositeTx.id,
    // Use the opposite tx's actual creator userId — the underlying model layer scopes its
    // UPDATE by `(id, userId)`, and for cross-user transfers the caller doesn't own the
    // opposite row. Auth on this account has already been verified above.
    userId: oppositeTx.userId,
    amount: destinationAmount !== undefined ? destinationAmount : undefined,
    refAmount: baseTransaction.refAmount,
    transactionType: TRANSACTION_TYPES.income,
    accountId: destinationAccountId,
    note,
    time,
    paymentType,
    categoryId,
    currencyCode: oppositeTx.currencyCode,
  });

  // If accountId was changed to a new one
  if (destinationAccountId && destinationAccountId !== oppositeTx.accountId) {
    // Since destinationAccountId is changed, we need to change currency too
    const { currency: oppositeTxCurrency } = await Accounts.getAccountCurrency({
      userId,
      id: destinationAccountId,
    });

    updateOppositeTxParams = {
      ...updateOppositeTxParams,
      currencyCode: oppositeTxCurrency.code,
    };
  }

  const { oppositeRefAmount, baseTransaction: updatedBaseTransaction } = await calcTransferTransactionRefAmount({
    userId,
    baseTransaction,
    destinationAmount: updateOppositeTxParams.amount!,
    oppositeTxCurrencyCode: updateOppositeTxParams.currencyCode,
    date: baseTransaction.time,
  });

  updateOppositeTxParams.refAmount = oppositeRefAmount;
  baseTransaction = updatedBaseTransaction;

  const destinationTransaction = await Transactions.updateTransactionById(updateOppositeTxParams);

  return { baseTx: baseTransaction, oppositeTx: destinationTransaction };
};

/**
 * If right now base tx is not transfer, but previously it was one, we need to:
 *
 * 1. unlink old opposite tx (remove transferId and set transferNature to not_transfer)
 * 2. remove "transferId" from base tx
 */
const unlinkOppositeTransaction = async (params: HelperFunctionsArgs) => {
  const [newData, prevData, baseTransaction] = params;

  // Orphaned transfer leg: `transferId` was cleared, so there's no pair to unlink. Querying
  // `findAll({ transferId: null })` would match unrelated rows (including other users') and
  // pick a bogus "opposite" — failing the auth gate (spurious 404) or, if writable, mutating
  // an unrelated row. Only the base tx needs clearing. See `updateTransferTransaction`.
  if (prevData.transferId) {
    // Cross-user safe fetch — see `updateTransferTransaction` for the rationale.
    const notBaseTransaction = (
      await Transactions.default.findAll({
        where: { transferId: prevData.transferId },
      })
    ).find((item) => item.id !== newData.id);

    if (notBaseTransaction) {
      await assertTxWriteAccess({
        userId: newData.userId,
        tx: notBaseTransaction,
        notFoundKey: 'transactions.oppositeTransactionNotFound',
      });

      await Transactions.updateTransactionById({
        id: notBaseTransaction.id,
        userId: notBaseTransaction.userId,
        transferId: null,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      });
    }
  }

  // Return the refreshed base tx so callers can surface the cleared
  // transferId/transferNature in the API response — the `baseTransaction`
  // snapshot they hold predates this update.
  return Transactions.updateTransactionById({
    id: baseTransaction.id,
    userId: baseTransaction.userId,
    transferId: null,
    transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
  });
};

const isUpdatingTransferTx = (payload: UpdateTransactionParams, prevData: Transactions.default) => {
  // nature label only affects reporting; the bookkeeping path is identical for both transfer kinds.
  const stillTransfer = payload.transferNature === undefined && isTwoLegTransfer(prevData.transferNature);

  // Previously was transfer, now also transfer
  const updatingTransfer = isTwoLegTransfer(payload.transferNature) && isTwoLegTransfer(prevData.transferNature);

  return stillTransfer || updatingTransfer;
};

const isCreatingTransfer = (payload: UpdateTransactionParams, prevData: Transactions.default) => {
  return (
    isTwoLegTransfer(payload.transferNature) && prevData.transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer
  );
};

const isDiscardingTransfer = (payload: UpdateTransactionParams, prevData: Transactions.default) => {
  return (
    payload.transferNature !== undefined &&
    !isTwoLegTransfer(payload.transferNature) &&
    isTwoLegTransfer(prevData.transferNature)
  );
};

/**
 * Updates transaction and updates account balance.
 */
export const updateTransaction = withTransaction(
  async (
    payload: UpdateTransactionParams,
  ): Promise<[baseTx: Transactions.default, oppositeTx?: Transactions.default]> => {
    try {
      // Single fetch + write-authorization gate. `getWritableTransactionById` throws 404
      // when the caller has no claim, 401 when scope: 'own' is violated. Returns a
      // pre-resolved `authCtx` so this service doesn't reassemble auth primitives.
      const { tx: prevData, ctx: authCtx } = await getWritableTransactionById({
        id: payload.id,
        userId: payload.userId,
      });

      const ctx: UpdateAuthContext = {
        callerUserId: payload.userId,
        accountOwnerUserId: authCtx.accountOwnerUserId,
        txCreatorUserId: prevData.userId,
        isOwner: authCtx.isOwner,
      };

      // Only an explicit nature change — promoting a non-transfer to a transfer, or
      // explicitly discarding a transfer link — has its own broken cross-user
      // opposite-tx handling and stays blocked for recipients.
      assertSharedWritePhase1Guards({
        isOwner: authCtx.isOwner,
        involvesTransfer: isCreatingTransfer(payload, prevData) || isDiscardingTransfer(payload, prevData),
        involvesRefund: payload.refundedByTxIds !== undefined || payload.refundsTxId !== undefined,
        changesAccountId: payload.accountId !== undefined && payload.accountId !== prevData.accountId,
      });

      // Recipients editing a shared-account tx whose currency they haven't connected
      // would otherwise trip `currencyNotConnected` inside the ref-amount lookup.
      // Auto-connect so the guard stays internal and not user-facing.
      if (!authCtx.isOwner) {
        const { currency: callerDefaultCurrency } = await UsersCurrencies.getCurrency({
          userId: ctx.callerUserId,
          isDefaultCurrency: true,
        });
        if (prevData.currencyCode !== callerDefaultCurrency.code) {
          await ensureUserCurrencyConnected({
            userId: ctx.callerUserId,
            currencyCode: prevData.currencyCode,
          });
        }
      }

      // Validate that passed parameters are not breaking anything
      await validateTransaction(payload, prevData, ctx);

      if (payload.categoryId !== undefined && payload.categoryId !== null) {
        await findOrThrowNotFound({
          query: Categories.findOne({
            where: { id: payload.categoryId, userId: ctx.accountOwnerUserId },
          }),
          message: 'Category not found or does not belong to user.',
        });
      }

      // Make basic updation to the base transaction. "Transfer" transactions
      // handled down in the code
      const baseTransaction = await makeBasicBaseTxUpdation(payload, prevData, ctx);

      let updatedTransactions: [Transactions.default, Transactions.default?] = [baseTransaction];

      const helperFunctionsArgs: HelperFunctionsArgs = [payload, prevData, baseTransaction];

      if (isUpdatingTransferTx(payload, prevData)) {
        // Handle the case when initially tx was "expense", became "transfer",
        // but now user wants to unmark it from transfer and make "income"
        if (payload.transactionType !== undefined && payload.transactionType !== prevData.transactionType) {
          await unlinkOppositeTransaction(helperFunctionsArgs);
        }

        const { baseTx, oppositeTx } = await updateTransferTransaction(helperFunctionsArgs);

        updatedTransactions = [baseTx, oppositeTx];
      } else if (isCreatingTransfer(payload, prevData)) {
        if (payload.destinationTransactionId) {
          const result = await linkTransactions({
            userId: payload.userId,
            ids: [[updatedTransactions[0].id, payload.destinationTransactionId]],
            ignoreBaseTxTypeValidation: true,
          });
          const [baseTx, oppositeTx] = result[0]!;

          updatedTransactions = [baseTx, oppositeTx];
        } else {
          const { baseTx, oppositeTx } = await createOppositeTransaction([
            // When updating existing tx we usually don't pass transactionType, so
            // it will be `undefined`, that's why we derive it from prevData
            {
              ...payload,
              time: payload.time ?? new Date(),
              transactionType: payload.transactionType ?? prevData.transactionType,
            },
            baseTransaction,
          ]);
          updatedTransactions = [baseTx, oppositeTx];
        }
      } else if (isDiscardingTransfer(payload, prevData)) {
        const unlinkedBaseTx = await unlinkOppositeTransaction(helperFunctionsArgs);
        if (unlinkedBaseTx) updatedTransactions = [unlinkedBaseTx];
      }

      // Handle splits
      const isTransfer = isTwoLegTransfer(baseTransaction.transferNature) || isTwoLegTransfer(payload.transferNature);

      if (payload.splits !== undefined) {
        if (isTransfer) {
          // If transaction is or becomes a transfer, delete any existing splits.
          // Auth on the parent transaction has already passed, so split deletion is
          // keyed by transactionId only — recipient writers can clear owner-authored
          // splits when permitted by `transactionsWriteScope`.
          await deleteSplitsForTransaction({ transactionId: baseTransaction.id });
        } else if (payload.splits === null || payload.splits.length === 0) {
          // Explicitly clearing splits
          await deleteSplitsForTransaction({ transactionId: baseTransaction.id });
        } else {
          // Update splits. `userId` here is creator metadata stamped on newly
          // inserted split rows — internal lookups inside `manageSplits` are keyed
          // by `transactionId` only. `categoryOwnerUserId` scopes the category-existence
          // check so recipients on shared accounts validate against the owner's set.
          await manageSplits({
            transactionId: baseTransaction.id,
            userId: ctx.callerUserId,
            categoryOwnerUserId: ctx.accountOwnerUserId,
            splits: payload.splits,
            transactionAmount: baseTransaction.amount,
            transactionCurrencyCode: baseTransaction.currencyCode,
            transactionTime: baseTransaction.time,
            transferNature: baseTransaction.transferNature,
          });
        }
      } else if (isCreatingTransfer(payload, prevData)) {
        // If transaction is becoming a transfer, clear any existing splits
        await deleteSplitsForTransaction({ transactionId: baseTransaction.id });
      }

      // Handle tags
      if (payload.tagIds !== undefined) {
        if (payload.tagIds === null || payload.tagIds.length === 0) {
          // Clear all tags
          await baseTransaction.$set('tags', []);
        } else {
          // Validate that all tagIds belong to the current user
          const userTags = await Tags.findAll({
            where: { userId: payload.userId, id: payload.tagIds },
            attributes: ['id'],
          });

          if (userTags.length !== payload.tagIds.length) {
            throw new ValidationError({
              message: t({ key: 'transactions.invalidTagIds' }),
            });
          }

          // Set new tags
          await baseTransaction.$set('tags', payload.tagIds);

          if (payload.tagIds?.length) {
            // Emit event for real-time reminders check (handled by event listener)
            eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_TAGGED, { tagIds: payload.tagIds, userId: payload.userId });
          }
        }
      }

      return updatedTransactions;
    } catch (e) {
      logger.error(e as Error);
      throw e;
    }
  },
);
