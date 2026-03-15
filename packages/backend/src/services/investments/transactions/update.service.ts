import { TRANSACTION_TYPES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { INVESTMENT_DECIMAL_SCALE, Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import Holdings from '@models/investments/Holdings.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { recalculateHolding } from '@services/investments/holdings/recalculation.service';
import { Big } from 'big.js';

interface UpdateTransactionParams {
  userId: number;
  transactionId: number;
  category?: INVESTMENT_TRANSACTION_CATEGORY;
  date?: string;
  quantity?: string;
  price?: string;
  fees?: string;
  name?: string;
}

const updateInvestmentTransactionImpl = async (params: UpdateTransactionParams) => {
  const { userId, transactionId, ...updateFields } = params;

  // Find the transaction and verify ownership through portfolio
  const transaction = await InvestmentTransaction.findOne({
    where: { id: transactionId },
    include: [{ model: Portfolios, as: 'portfolio', where: { userId }, required: true }],
  });

  if (!transaction) {
    throw new NotFoundError({ message: t({ key: 'investments.transactionNotFound' }) });
  }

  // Store the portfolioId and securityId for recalculation
  const { portfolioId, securityId } = transaction;

  // Get the holding for validation
  const holding = await Holdings.findOne({
    where: { portfolioId, securityId },
  });

  if (!holding) {
    throw new NotFoundError({ message: t({ key: 'investments.holdingNotFound' }) });
  }

  // Business rule: Check for sufficient shares when updating to a sell transaction
  const finalCategory = updateFields.category ?? transaction.category;
  const finalQuantity = updateFields.quantity ?? transaction.quantity.toDecimalString(INVESTMENT_DECIMAL_SCALE);

  if (finalCategory === INVESTMENT_TRANSACTION_CATEGORY.sell) {
    // Calculate what the quantity would be after removing this transaction's effect
    // then check if we have enough for the new quantity
    let adjustedHoldingQuantity = holding.quantity.toBig();

    // If this transaction was originally a buy, we need to subtract its quantity
    // If it was originally a sell, we need to add its quantity back
    if (transaction.category === INVESTMENT_TRANSACTION_CATEGORY.buy) {
      adjustedHoldingQuantity = adjustedHoldingQuantity.minus(transaction.quantity.toBig());
    } else if (transaction.category === INVESTMENT_TRANSACTION_CATEGORY.sell) {
      adjustedHoldingQuantity = adjustedHoldingQuantity.plus(transaction.quantity.toBig());
    }

    const sellQuantity = new Big(finalQuantity);

    if (sellQuantity.gt(adjustedHoldingQuantity)) {
      throw new ValidationError({
        message: t({
          key: 'investments.insufficientSharesToSell',
          variables: {
            adjustedQuantity: adjustedHoldingQuantity.toFixed(),
            sellQuantity: sellQuantity.toFixed(),
          },
        }),
      });
    }
  }

  // Prepare update data with only provided fields
  const updateData: Partial<InvestmentTransaction> = {};

  if (updateFields.category !== undefined) {
    updateData.category = updateFields.category;
    // Update transaction type based on category
    updateData.transactionType =
      updateFields.category === INVESTMENT_TRANSACTION_CATEGORY.buy
        ? TRANSACTION_TYPES.expense
        : TRANSACTION_TYPES.income;
  }

  if (updateFields.date !== undefined) {
    updateData.date = updateFields.date;
  }

  if (updateFields.name !== undefined) {
    updateData.name = updateFields.name;
  }

  if (updateFields.quantity !== undefined) {
    updateData.quantity = Money.fromDecimal(updateFields.quantity);
  }

  if (updateFields.price !== undefined) {
    updateData.price = Money.fromDecimal(updateFields.price);
  }

  if (updateFields.fees !== undefined) {
    updateData.fees = Money.fromDecimal(updateFields.fees);
  }

  // Recalculate amount if quantity or price changed
  const newQuantity = updateFields.quantity ?? transaction.quantity.toDecimalString(INVESTMENT_DECIMAL_SCALE);
  const newPrice = updateFields.price ?? transaction.price.toDecimalString(INVESTMENT_DECIMAL_SCALE);
  const newFees = updateFields.fees ?? transaction.fees.toDecimalString(INVESTMENT_DECIMAL_SCALE);
  const newDate = updateFields.date ?? transaction.date;

  const amount = new Big(newQuantity).times(new Big(newPrice)).plus(new Big(newFees)).toFixed(10);
  updateData.amount = Money.fromDecimal(amount);

  // Recalculate reference amounts if relevant fields changed
  const needsRefAmountRecalc =
    updateFields.quantity !== undefined ||
    updateFields.price !== undefined ||
    updateFields.fees !== undefined ||
    updateFields.date !== undefined;

  if (needsRefAmountRecalc) {
    if (holding) {
      const [refAmount, refPrice, refFees] = await Promise.all([
        calculateRefAmount({
          amount: Money.fromDecimal(amount),
          userId,
          date: newDate,
          baseCode: holding.currencyCode,
        }),
        calculateRefAmount({
          amount: Money.fromDecimal(newPrice),
          userId,
          date: newDate,
          baseCode: holding.currencyCode,
        }),
        calculateRefAmount({
          amount: Money.fromDecimal(newFees),
          userId,
          date: newDate,
          baseCode: holding.currencyCode,
        }),
      ]);

      updateData.refAmount = refAmount;
      updateData.refPrice = refPrice;
      updateData.refFees = refFees;
    }
  }

  // Update the transaction
  await transaction.update(updateData);

  // After updating the transaction, trigger a full recalculation of the holding
  await recalculateHolding({ portfolioId, securityId });

  // Return the updated transaction
  await transaction.reload();
  return transaction;
};

export const updateInvestmentTransaction = withTransaction(updateInvestmentTransactionImpl);
