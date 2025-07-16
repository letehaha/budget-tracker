import { TRANSACTION_TYPES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { NotFoundError, ValidationError } from '@js/errors';
import Holdings from '@models/investments/Holdings.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common';
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
    throw new NotFoundError({ message: 'Investment transaction not found' });
  }

  // Store the portfolioId and securityId for recalculation
  const { portfolioId, securityId } = transaction;

  // Get the holding for validation
  const holding = await Holdings.findOne({
    where: { portfolioId, securityId },
  });

  if (!holding) {
    throw new NotFoundError({ message: 'Holding not found' });
  }

  // Business rule: Check for sufficient shares when updating to a sell transaction
  const finalCategory = updateFields.category ?? transaction.category;
  const finalQuantity = updateFields.quantity ?? transaction.quantity;

  if (finalCategory === INVESTMENT_TRANSACTION_CATEGORY.sell) {
    // Calculate what the quantity would be after removing this transaction's effect
    // then check if we have enough for the new quantity
    let adjustedHoldingQuantity = new Big(holding.quantity);

    // If this transaction was originally a buy, we need to subtract its quantity
    // If it was originally a sell, we need to add its quantity back
    if (transaction.category === INVESTMENT_TRANSACTION_CATEGORY.buy) {
      adjustedHoldingQuantity = adjustedHoldingQuantity.minus(new Big(transaction.quantity));
    } else if (transaction.category === INVESTMENT_TRANSACTION_CATEGORY.sell) {
      adjustedHoldingQuantity = adjustedHoldingQuantity.plus(new Big(transaction.quantity));
    }

    const sellQuantity = new Big(finalQuantity);

    if (sellQuantity.gt(adjustedHoldingQuantity)) {
      throw new ValidationError({
        message: `Insufficient shares to sell. After this update, you would have ${adjustedHoldingQuantity.toFixed()} shares but are trying to sell ${sellQuantity.toFixed()} shares.`,
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
    updateData.quantity = updateFields.quantity;
  }

  if (updateFields.price !== undefined) {
    updateData.price = updateFields.price;
  }

  if (updateFields.fees !== undefined) {
    updateData.fees = updateFields.fees;
  }

  // Recalculate amount if quantity or price changed
  const newQuantity = updateFields.quantity ?? transaction.quantity;
  const newPrice = updateFields.price ?? transaction.price;
  const newFees = updateFields.fees ?? transaction.fees;
  const newDate = updateFields.date ?? transaction.date;

  const amount = new Big(newQuantity).times(new Big(newPrice)).plus(new Big(newFees)).toFixed(10);
  updateData.amount = amount;

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
          amount: parseFloat(amount),
          userId,
          date: newDate,
          baseCode: holding.currencyCode,
        }),
        calculateRefAmount({
          amount: parseFloat(newPrice),
          userId,
          date: newDate,
          baseCode: holding.currencyCode,
        }),
        calculateRefAmount({
          amount: parseFloat(newFees),
          userId,
          date: newDate,
          baseCode: holding.currencyCode,
        }),
      ]);

      updateData.refAmount = refAmount.toString();
      updateData.refPrice = refPrice.toString();
      updateData.refFees = refFees.toString();
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
