import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { NotFoundError, ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import { logger } from '@js/utils/logger';
import * as Accounts from '@models/Accounts.model';
import RefundTransactions from '@models/RefundTransactions.model';
import * as Transactions from '@models/Transactions.model';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import * as refundsService from '@services/tx-refunds';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';
import { calcTransferTransactionRefAmount, createOppositeTransaction } from './create-transaction';
import { getTransactionById } from './get-by-id';
import { linkTransactions } from './transactions-linking';
import { type UpdateTransactionParams } from './types';

export const EXTERNAL_ACCOUNT_RESTRICTED_UPDATION_FIELDS = ['amount', 'time', 'transactionType', 'accountId'];

/**
 * 1. Do not allow editing specified fields
 * 2. Do now allow editing non-source transaction (TODO: except it's an external one)
 */
const validateTransaction = async (newData: UpdateTransactionParams, prevData: Transactions.default) => {
  if (+newData.id !== +prevData.id) throw new ValidationError({ message: 'id cannot be changed' });

  // Check the account type, not the transaction type
  // A system transaction in a monobank account should be treated as external
  const account = await Accounts.getAccountById({
    userId: newData.userId,
    id: prevData.accountId,
  });

  if (!account) {
    throw new NotFoundError({
      message: 'Account not found for this transaction',
    });
  }

  const isExternalAccount = account.type !== ACCOUNT_TYPES.system;

  if (isExternalAccount) {
    if (EXTERNAL_ACCOUNT_RESTRICTED_UPDATION_FIELDS.some((field) => newData[field] !== undefined)) {
      throw new ValidationError({
        message: 'Attempt to edit readonly fields of the external account',
      });
    }
  }

  if (newData.transactionType && isExternalAccount && newData.transactionType !== prevData.transactionType) {
    throw new ValidationError({
      message: 'It\'s disallowed to change "transactionType" of the non-system account',
    });
  }

  if (newData.refundedByTxIds !== undefined && newData.refundsTxId !== undefined) {
    throw new ValidationError({
      message:
        'You cannot use both "refundedByTxIds" and "refundsTxId" simultaneously. Please choose one or the other.',
    });
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

const makeBasicBaseTxUpdation = async (newData: UpdateTransactionParams, prevData: Transactions.default) => {
  const { currency: defaultUserCurrency } = await UsersCurrencies.getCurrency({
    userId: newData.userId,
    isDefaultCurrency: true,
  });

  // Check the account type, not the transaction type
  const account = await Accounts.getAccountById({
    userId: newData.userId,
    id: prevData.accountId,
  });

  const isSystemAccount = account?.type === ACCOUNT_TYPES.system;

  // Never update "transactionType" of non-system transactions. Just an additional guard
  const transactionType = isSystemAccount ? newData.transactionType : prevData.transactionType;

  const baseTransactionUpdateParams: Transactions.UpdateTransactionByIdParams & {
    amount: number;
    refAmount: number;
    currencyCode: string;
    time: Date;
  } = {
    id: newData.id,
    amount: newData.amount ?? prevData.amount,
    refAmount: newData.amount ?? prevData.refAmount,
    note: newData.note,
    time: newData.time ?? prevData.time,
    userId: newData.userId,
    transactionType,
    paymentType: newData.paymentType,
    accountId: newData.accountId,
    categoryId: newData.categoryId,
    transferNature: newData.transferNature,
    currencyCode: prevData.currencyCode,
    refundLinked: prevData.refundLinked,
  };

  const isBaseTxAccountChanged = newData.accountId && newData.accountId !== prevData.accountId;

  if (isBaseTxAccountChanged) {
    // Since accountId is changed, we need to change currency too
    const { currency: baseTxCurrency } = await Accounts.getAccountCurrency({
      userId: newData.userId,
      id: Number(newData.accountId),
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

  if (newData.refundedByTxIds !== undefined) {
    const refundsShouldBeRemoved = prevData.refundLinked && newData.refundedByTxIds === null;
    const refundsShouldBeSetOrOverriden = Array.isArray(newData.refundedByTxIds) && newData.refundedByTxIds.length;

    if (refundsShouldBeRemoved || refundsShouldBeSetOrOverriden) {
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
          raw: true,
        });
        const sum = newTransactions.reduce((acc, curr) => (acc += curr.refAmount), 0);

        if (sum > baseTransactionUpdateParams.refAmount) {
          throw new ValidationError({
            message: 'Total refund amount cannot be greater than the original transaction amount',
          });
        }

        await Promise.all(
          newData.refundedByTxIds!.map((id) =>
            refundsService.createSingleRefund({
              originalTxId: newData.id,
              refundTxId: id,
              userId: newData.userId,
            }),
          ),
        );
        baseTransactionUpdateParams.refundLinked = true;
      }
    }
  } else if (newData.refundsTxId !== undefined) {
    const refundShouldBeRemoved = prevData.refundLinked && newData.refundsTxId === null;
    const refundShouldBeSetOrOverriden = newData.refundsTxId;

    if (refundShouldBeRemoved || refundShouldBeSetOrOverriden) {
      const previousRefunds = await refundsService.getRefundsForTransactionById({
        userId: newData.userId,
        transactionId: newData.id,
      });
      await removeRefunds(previousRefunds);

      if (refundShouldBeRemoved) baseTransactionUpdateParams.refundLinked = false;
      if (refundShouldBeSetOrOverriden) {
        await refundsService.createSingleRefund({
          originalTxId: newData.refundsTxId,
          refundTxId: newData.id,
          userId: newData.userId,
        });
        baseTransactionUpdateParams.refundLinked = true;
      }
    }
  }

  const baseTransaction = await Transactions.updateTransactionById(baseTransactionUpdateParams);

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

  const oppositeTx = (
    await Transactions.getTransactionsByArrayOfField({
      fieldValues: [prevData.transferId],
      fieldName: 'transferId',
      userId,
    })
  ).find((item) => Number(item.id) !== Number(newData.id));

  if (!oppositeTx) {
    throw new NotFoundError({
      message: 'Cannot find opposite tx to make an updation',
    });
  }

  let updateOppositeTxParams = removeUndefinedKeys({
    id: oppositeTx.id,
    userId,
    amount: destinationAmount,
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

  const notBaseTransaction = (
    await Transactions.getTransactionsByArrayOfField({
      fieldValues: [prevData.transferId],
      fieldName: 'transferId',
      userId: newData.userId,
    })
  ).find((item) => Number(item.id) !== Number(newData.id));

  if (notBaseTransaction) {
    await Transactions.updateTransactionById({
      id: notBaseTransaction.id,
      userId: notBaseTransaction.userId,
      transferId: null,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
    });
  }

  await Transactions.updateTransactionById({
    id: baseTransaction.id,
    userId: baseTransaction.userId,
    transferId: null,
    transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
  });
};

const isUpdatingTransferTx = (payload: UpdateTransactionParams, prevData: Transactions.default) => {
  // Previously was transfer, now NOT a transfer
  const nowNotTransfer =
    payload.transferNature === undefined && prevData.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer;

  // Previously was transfer, now also transfer
  const updatingTransfer =
    payload.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer &&
    prevData.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer;

  return nowNotTransfer || updatingTransfer;
};

const isCreatingTransfer = (payload: UpdateTransactionParams, prevData: Transactions.default) => {
  return (
    payload.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer &&
    prevData.transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer
  );
};

const isDiscardingTransfer = (payload: UpdateTransactionParams, prevData: Transactions.default) => {
  return (
    payload.transferNature !== TRANSACTION_TRANSFER_NATURE.common_transfer &&
    prevData.transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer
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
      const prevData = await getTransactionById({
        id: payload.id,
        userId: payload.userId,
      });

      if (!prevData) {
        throw new NotFoundError({
          message: 'Transaction with provided `id` does not exist!',
        });
      }

      // Validate that passed parameters are not breaking anything
      await validateTransaction(payload, prevData);

      // Make basic updation to the base transaction. "Transfer" transactions
      // handled down in the code
      const baseTransaction = await makeBasicBaseTxUpdation(payload, prevData);

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
        await unlinkOppositeTransaction(helperFunctionsArgs);
      }

      return updatedTransactions;
    } catch (e) {
      logger.error(e as Error);
      throw e;
    }
  },
);
