import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { UnwrapPromise } from '@common/types';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { UnexpectedError, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import * as Accounts from '@models/accounts.model';
import Categories from '@models/categories.model';
import Tags from '@models/tags.model';
import * as Transactions from '@models/transactions.model';
import * as UsersCurrencies from '@models/users-currencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { DOMAIN_EVENTS, eventBus } from '@services/common/event-bus';
import {
  assertSharedWritePhase1Guards,
  authorizeAccountWrite,
} from '@services/sharing/auth/authorize-account-write.service';
import { ensureUserCurrencyConnected } from '@services/sharing/auth/ensure-currency-connected.service';
import { v4 as uuidv4 } from 'uuid';

import { withTransaction } from '../common/with-transaction';
import { createSingleRefund } from '../tx-refunds/create-single-refund.service';
import { manageSplits } from './splits';
import { linkTransactions } from './transactions-linking';
import type { CreateTransactionParams, UpdateTransactionParams } from './types';

type CreateOppositeTransactionParams = [
  creationParams: (CreateTransactionParams | UpdateTransactionParams) & {
    time: Date;
  },
  baseTransaction: Transactions.default,
];

/**
 * Calculate oppositeTx based on baseTx amount and currency.
 *
 * *ref-transaction - transaction with ref-currency, means user's base currency
 *
 * 1. If source transaction is a ref-transaction, and opposite is non-ref,
 *    then opposite's refAmount should be the same as of source
 * 2. If source tx is a non-ref, and opposite is ref - then source's
 *    refAmount should be the same as opposite. We update its value right in that
 *    helper and return it back
 * 3. If both are ref, then they both should have same refAmount
 * 4. If both are non-ref, then each of them has separate refAmount. So we don't
 *    touch source tx, and calculate refAmount for opposite tx
 *
 */
export const calcTransferTransactionRefAmount = async ({
  userId,
  baseTransaction,
  destinationAmount,
  oppositeTxCurrencyCode,
  baseCurrency,
  date,
}: {
  userId: number;
  baseTransaction: Transactions.default;
  destinationAmount: Money;
  oppositeTxCurrencyCode: string;
  baseCurrency?: UnwrapPromise<ReturnType<typeof UsersCurrencies.getBaseCurrency>>;
  date: Date;
}) => {
  if (!baseCurrency) {
    baseCurrency = await UsersCurrencies.getBaseCurrency({ userId });
  }

  const isSourceRef = baseTransaction.currencyCode === baseCurrency.currency.code;
  const isOppositeRef = oppositeTxCurrencyCode === baseCurrency.currency.code;

  let oppositeRefAmount: Money = destinationAmount;

  if (isSourceRef && !isOppositeRef) {
    oppositeRefAmount = baseTransaction.refAmount;
  } else if (!isSourceRef && isOppositeRef) {
    baseTransaction = await Transactions.updateTransactionById({
      id: baseTransaction.id,
      userId,
      refAmount: destinationAmount,
    });
    oppositeRefAmount = destinationAmount;
  } else if (isSourceRef && isOppositeRef) {
    oppositeRefAmount = baseTransaction.refAmount;
  } else if (!isSourceRef && !isOppositeRef) {
    oppositeRefAmount = await calculateRefAmount({
      userId,
      amount: destinationAmount,
      baseCode: oppositeTxCurrencyCode,
      quoteCode: baseCurrency.currency.code,
      date,
    });
  }

  return {
    oppositeRefAmount,
    baseTransaction,
  };
};

/**
 * If previously the base tx wasn't transfer, so it was income or expense, we need to:
 *
 * 1. create an opposite tx
 * 2. generate "transferId" and put it to both transactions
 * 3. Calculate correct refAmount for both base and opposite tx. Logic is described down in the code
 */
export const createOppositeTransaction = async (params: CreateOppositeTransactionParams) => {
  const [creationParams, baseTransaction] = params;

  const { destinationAmount, destinationAccountId, userId, transactionType } = creationParams;

  if (!destinationAmount || !destinationAccountId) {
    throw new ValidationError({
      message: t({ key: 'transactions.missingRequiredFields' }),
    });
  }

  const transferId = uuidv4();

  let baseTx = await Transactions.updateTransactionById({
    id: baseTransaction.id,
    userId: baseTransaction.userId,
    transferId,
    transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
  });

  const { currency: oppositeTxCurrency } = await Accounts.getAccountCurrency({
    userId,
    id: destinationAccountId,
  });

  const defaultUserCurrency = await UsersCurrencies.getBaseCurrency({ userId });

  const { oppositeRefAmount, baseTransaction: updatedBaseTransaction } = await calcTransferTransactionRefAmount({
    userId,
    baseTransaction: baseTx,
    destinationAmount,
    oppositeTxCurrencyCode: oppositeTxCurrency.code,
    baseCurrency: defaultUserCurrency,
    date: new Date(baseTransaction.time),
  });

  baseTx = updatedBaseTransaction;

  const oppositeTx = await Transactions.createTransaction({
    userId: baseTransaction.userId,
    amount: destinationAmount,
    refAmount: oppositeRefAmount,
    note: baseTransaction.note,
    time: new Date(baseTransaction.time),
    transactionType:
      transactionType === TRANSACTION_TYPES.income ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
    paymentType: baseTransaction.paymentType,
    accountId: destinationAccountId,
    categoryId: baseTransaction.categoryId,
    accountType: ACCOUNT_TYPES.system,
    currencyCode: oppositeTxCurrency.code,
    refCurrencyCode: defaultUserCurrency.currency.code,
    transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
    transferId,
  });

  return { baseTx, oppositeTx: oppositeTx! };
};

/**
 * Creates transaction and updates account balance.
 */
export const createTransaction = withTransaction(
  async ({
    amount,
    commissionRate = Money.zero(),
    userId,
    accountId,
    transferNature,
    destinationTransactionId,
    refundsTxId,
    refundsSplitId,
    splits,
    tagIds,
    ...payload
  }: CreateTransactionParams) => {
    try {
      // Detect negative amounts - this is a bug in the caller code
      // Transaction amounts should ALWAYS be positive, with transactionType determining expense/income
      if (amount.isNegative()) {
        const stack = new Error().stack;
        logger.error('Negative amount detected in createTransaction. This is a bug - amounts must be positive.', {
          amount: amount.toNumber(),
          userId,
          accountId,
          transactionType: payload.transactionType,
          stack,
        });
        amount = amount.abs();
      }

      if (refundsTxId && transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer) {
        throw new ValidationError({
          message: t({ key: 'transactions.refundAndTransferNotAllowed' }),
        });
      }

      // Account-scoped auth: owners pass; recipients need `write`. The returned
      // `accountOwnerUserId` scopes downstream owner-only lookups (account row, category
      // set) so a shared-account write resolves correctly. Phase-1 guards block recipient
      // flows that need their own follow-up slices.
      const { isOwner, accountOwnerUserId } = await authorizeAccountWrite({
        userId,
        accountId,
      });
      assertSharedWritePhase1Guards({
        isOwner,
        involvesTransfer: transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer,
        involvesRefund: refundsTxId !== undefined && refundsTxId !== null,
      });

      if (payload.categoryId !== undefined && payload.categoryId !== null) {
        await findOrThrowNotFound({
          query: Categories.findOne({ where: { id: payload.categoryId, userId: accountOwnerUserId } }),
          message: 'Category not found or does not belong to user.',
        });
      }

      const { currency: defaultUserCurrency } = await UsersCurrencies.getCurrency({
        userId,
        isDefaultCurrency: true,
      });

      const { currency: generalTxCurrency } = await Accounts.getAccountCurrency({
        userId: accountOwnerUserId,
        id: accountId,
      });

      // Recipients writing on a shared account whose currency they haven't connected
      // would otherwise trip `currencyNotConnected` inside the ref-amount lookup.
      // Auto-connect so the guard stays internal and not user-facing.
      if (!isOwner && generalTxCurrency.code !== defaultUserCurrency.code) {
        await ensureUserCurrencyConnected({ userId, currencyCode: generalTxCurrency.code });
      }

      const generalTxParams: Transactions.CreateTransactionPayload & {
        time: Date;
      } = {
        ...payload,
        time: payload.time ?? new Date(),
        amount,
        refAmount: amount,
        commissionRate,
        refCommissionRate: commissionRate,
        userId,
        accountId,
        transferNature,
        currencyCode: generalTxCurrency.code,
        transferId: undefined,
        refCurrencyCode: defaultUserCurrency.code,
      };

      if (defaultUserCurrency.code !== generalTxCurrency.code) {
        generalTxParams.refAmount = await calculateRefAmount({
          userId,
          amount: generalTxParams.amount,
          baseCode: generalTxCurrency.code,
          quoteCode: defaultUserCurrency.code,
          date: generalTxParams.time,
        });
        generalTxParams.refCommissionRate = await calculateRefAmount({
          userId,
          amount: generalTxParams.commissionRate || Money.zero(),
          baseCode: generalTxCurrency.code,
          quoteCode: defaultUserCurrency.code,
          date: generalTxParams.time,
        });
      }

      const baseTransaction = await Transactions.createTransaction(generalTxParams);

      let transactions: [baseTx: Transactions.default, oppositeTx?: Transactions.default] = [baseTransaction!];

      if (refundsTxId && transferNature !== TRANSACTION_TRANSFER_NATURE.common_transfer) {
        await createSingleRefund({
          userId,
          originalTxId: refundsTxId,
          refundTxId: baseTransaction!.id,
          splitId: refundsSplitId,
        });
      } else if (transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer) {
        logger.info('Transfer transaction creation');
        /**
         * If transaction is transfer between two accounts, add transferId to both
         * transactions to connect them, and use destinationAmount and destinationAccountId
         * for the second transaction.
         */

        if (destinationTransactionId) {
          /**
           * When "destinationTransactionId" is provided, we don't need to create an
           * opposite transaction, since it's expected to use the existing one.
           * We need to update the existing one, or fail the whole creation if it
           * doesn't exist
           */
          const result = await linkTransactions({
            userId,
            ids: [[baseTransaction!.id, destinationTransactionId]],
            ignoreBaseTxTypeValidation: true,
          });
          if (result[0]) {
            const [baseTx, oppositeTx] = result[0];
            transactions = [baseTx, oppositeTx];
          } else {
            logger.info('Cannot create transaction with provided params', {
              ids: [[baseTransaction!.id, destinationTransactionId]],
              result,
            });
            throw new UnexpectedError({ message: t({ key: 'transactions.cannotCreateWithParams' }) });
          }
        } else {
          const res = await createOppositeTransaction([
            {
              amount,
              userId,
              accountId,
              transferNature,
              time: payload.time ?? new Date(),
              ...payload,
            },
            baseTransaction!,
          ]);
          transactions = [res.baseTx, res.oppositeTx];
        }
      }

      // Handle splits for non-transfer transactions
      if (splits && splits.length > 0 && transferNature !== TRANSACTION_TRANSFER_NATURE.common_transfer) {
        await manageSplits({
          transactionId: baseTransaction!.id,
          userId,
          categoryOwnerUserId: accountOwnerUserId,
          splits,
          transactionAmount: amount,
          transactionCurrencyCode: generalTxCurrency.code,
          transactionTime: generalTxParams.time,
          transferNature,
        });
      }

      // Handle tags for the transaction
      if (tagIds && tagIds.length > 0) {
        // Validate that all tagIds belong to the current user
        const userTags = await Tags.findAll({
          where: { userId, id: tagIds },
          attributes: ['id'],
        });

        if (userTags.length !== tagIds.length) {
          throw new ValidationError({
            message: t({ key: 'transactions.invalidTagIds' }),
          });
        }

        await baseTransaction!.$set('tags', tagIds);

        // Emit event for real-time reminders check (handled by event listener)
        eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_TAGGED, { tagIds, userId });
      }

      // Try to match the transaction to a subscription (non-critical)
      if (transferNature !== TRANSACTION_TRANSFER_NATURE.common_transfer) {
        try {
          const { matchTransactionToSubscriptions } = await import('@services/subscriptions');
          await matchTransactionToSubscriptions({ transaction: baseTransaction!, userId });
        } catch (error) {
          logger.error({
            message: 'Failed to match transaction to subscriptions',
            error: error as Error,
          });
        }
      }

      return transactions;
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') {
        logger.error(e as Error);
      }
      throw e;
    }
  },
);
