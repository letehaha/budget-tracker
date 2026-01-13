import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES, asCents } from '@bt/shared/types';
import { UnwrapPromise } from '@common/types';
import { t } from '@i18n/index';
import { UnexpectedError, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import * as Accounts from '@models/Accounts.model';
import Balances from '@models/Balances.model';
import Tags from '@models/Tags.model';
import * as Transactions from '@models/Transactions.model';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { DOMAIN_EVENTS, eventBus } from '@services/common/event-bus';
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
  destinationAmount: number;
  oppositeTxCurrencyCode: string;
  baseCurrency?: UnwrapPromise<ReturnType<typeof UsersCurrencies.getBaseCurrency>>;
  date: Date;
}) => {
  if (!baseCurrency) {
    baseCurrency = await UsersCurrencies.getBaseCurrency({ userId });
  }

  const isSourceRef = baseTransaction.currencyCode === baseCurrency.currency.code;
  const isOppositeRef = oppositeTxCurrencyCode === baseCurrency.currency.code;

  let oppositeRefAmount = destinationAmount;

  if (isSourceRef && !isOppositeRef) {
    oppositeRefAmount = baseTransaction.refAmount;
  } else if (!isSourceRef && isOppositeRef) {
    baseTransaction = await Transactions.updateTransactionById({
      id: baseTransaction.id,
      userId,
      refAmount: asCents(destinationAmount),
    });
    oppositeRefAmount = destinationAmount;
  } else if (isSourceRef && isOppositeRef) {
    oppositeRefAmount = baseTransaction.refAmount;
  } else if (!isSourceRef && !isOppositeRef) {
    oppositeRefAmount = await calculateRefAmount({
      userId,
      amount: asCents(destinationAmount),
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
  logger.info('State before transfer', {
    accountFrom: {
      balance: 10,
      refBalance: 100,
      balance_in_table: 100,
    },
    accountTo: {},
  });

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
    amount: asCents(destinationAmount),
    refAmount: asCents(oppositeRefAmount),
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
    commissionRate = asCents(0),
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
      if (amount < 0) {
        const stack = new Error().stack;
        logger.error('Negative amount detected in createTransaction. This is a bug - amounts must be positive.', {
          amount,
          userId,
          accountId,
          transactionType: payload.transactionType,
          stack,
        });
        amount = asCents(Math.abs(amount));
      }

      if (refundsTxId && transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer) {
        throw new ValidationError({
          message: t({ key: 'transactions.refundAndTransferNotAllowed' }),
        });
      }

      const { currency: defaultUserCurrency } = await UsersCurrencies.getCurrency({
        userId,
        isDefaultCurrency: true,
      });

      const { currency: generalTxCurrency } = await Accounts.getAccountCurrency({
        userId,
        id: accountId,
      });

      const generalTxParams: Transactions.CreateTransactionPayload & {
        time: Date;
      } = {
        ...payload,
        time: payload.time ?? new Date(),
        amount,
        refAmount: amount,
        commissionRate: commissionRate || asCents(0),
        refCommissionRate: commissionRate || asCents(0),
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
          amount: generalTxParams.commissionRate || asCents(0),
          baseCode: generalTxCurrency.code,
          quoteCode: defaultUserCurrency.code,
          date: generalTxParams.time,
        });
      }

      await logDataBefore({
        amount,
        refAmount: generalTxParams.refAmount,
        userId,
        accountId,
        transferNature,
        destinationTransactionId,
        refundsTxId,
        ...payload,
      });

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

      return transactions;
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') {
        logger.error(e as Error);
      }
      throw e;
    }
  },
);

// {
//   "accountId": 40,
//   "amount": 150_000,
//   "balance": 684_278,
//   "balanceDetails": 2_056_344,
//   "level": "info",
//   "message": "Before",
//   "refAmount": 1_518_517,
//   "refBalance": 6_331_767,
// }

const logDataBefore = async (params: CreateTransactionParams & { refAmount?: number }) => {
  try {
    const { transferNature, destinationTransactionId, userId, accountId, transactionType } = params;
    const isTransfer = transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer;
    const transferWithoutLinking = isTransfer && !destinationTransactionId;
    const isBasicExpense =
      transactionType === TRANSACTION_TYPES.expense && transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer;

    const baseAccount = (await Accounts.getAccountById({
      userId,
      id: params.accountId,
    }))!;
    const baseAccountBalance = (await Balances.findOne({
      where: { accountId },
      order: [['date', 'DESC']],
      attributes: ['amount'],
    }))!;

    if (isBasicExpense) {
      logger.info('Create expense transaction');
      logger.info('Before', {
        accountId,
        balance: baseAccount.currentBalance,
        amount: params.amount,
        refBalance: baseAccount.refCurrentBalance,
        refAmount: params.refAmount,
        balanceDetails: baseAccountBalance.amount,
      });
    } else if (transferWithoutLinking) {
      logger.info(`Details before basic transfer:
        Account from:
          accountId: ${accountId}
          balance: ${baseAccount.currentBalance}
          refBalance: ${baseAccount.refCurrentBalance}
          balanceDetails: ${baseAccountBalance.amount}
        `);
    }
  } catch (err) {
    logger.error(err as Error);
  }
};
