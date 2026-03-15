import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY, InvestmentTransactionModel } from '@bt/shared/types/investments';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import {
  Attribute,
  AutoIncrement,
  BelongsTo,
  Default,
  Index,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';

import Portfolios from './Portfolios.model';
import Securities from './Securities.model';

@Table({
  timestamps: true,
  tableName: 'InvestmentTransactions',
})
export default class InvestmentTransaction
  extends Model<InferAttributes<InvestmentTransaction>, InferCreationAttributes<InvestmentTransaction>>
  implements InvestmentTransactionModel
{
  /**
   * IMPORTANT: Investment transactionType Logic
   *
   * The relationship between `category` and `transactionType` represents CASH FLOW direction:
   *
   * BUY transactions:
   * - category: INVESTMENT_TRANSACTION_CATEGORY.buy
   * - transactionType: TRANSACTION_TYPES.expense
   * - Logic: You are SPENDING money to purchase securities (cash leaves your account)
   * - Example: Buy 100 shares of Apple for $15,000 → Your account balance DECREASES
   *
   * SELL transactions:
   * - category: INVESTMENT_TRANSACTION_CATEGORY.sell
   * - transactionType: TRANSACTION_TYPES.income
   * - Logic: You are RECEIVING money from selling securities (cash enters your account)
   * - Example: Sell 100 shares of Apple for $17,000 → Your account balance INCREASES
   *
   * This might seem counterintuitive since you're "losing" shares when selling, but the
   * transactionType tracks the CASH FLOW, not the security movement. Think of it from
   * your bank account's perspective - selling securities brings money IN (income).
   */

  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  @Unique
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare securityId: number;

  // New portfolioId field for portfolio migration
  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare portfolioId: number;

  /**
   * The transaction type representing cash flow direction:
   * - EXPENSE: Money leaving your account (BUY transactions)
   * - INCOME: Money entering your account (SELL transactions)
   * See class-level documentation above for detailed explanation.
   */
  @Attribute(DataTypes.ENUM(...Object.values(TRANSACTION_TYPES)))
  @NotNull
  declare transactionType: TRANSACTION_TYPES;

  @Attribute(DataTypes.DATEONLY)
  @NotNull
  @Index
  declare date: string;

  /**
   * A descriptive name or title for the investment transaction, providing a
   * quick overview of the transaction's nature. Same as `note` in `Transactions`
   */
  @Attribute(DataTypes.STRING(2000))
  declare name: string | null;

  /**
   * The monetary value involved in the transaction. Depending on the context,
   * this could represent the cost, sale proceeds, or other financial values
   * associated with the transaction. Calculated as quantity * price + fees
   */
  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  declare amount: string;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  declare refAmount: string;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  declare fees: string;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  declare refFees: string;

  /**
   * * The quantity of the security involved in the transaction. This is crucial
   * for tracking the changes in holdings as a result of the transaction.
   */
  @Attribute(DataTypes.DECIMAL(36, 18))
  @NotNull
  declare quantity: string;

  /**
   * The price per unit of the security at the time of the transaction.
   * This is used to calculate the total transaction amount and update the cost
   * basis of the holding.
   */
  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  declare price: string;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  declare refPrice: string;

  /**
   * The ISO currency code or standard cryptocurrency code representing the currency
   * in which the transaction was conducted. For cryptocurrencies, this code refers to
   * the specific cryptocurrency involved (e.g., BTC for Bitcoin, ETH for Ethereum).
   */
  @Attribute(DataTypes.STRING)
  @NotNull
  @Default('USD')
  declare currencyCode: string;

  /**
   * A category that classifies the nature of the investment transaction.
   * This could include types like 'buy', 'sell', 'dividend', 'interest', etc.,
   * providing a clear context for the transaction's purpose and impact on the investment portfolio.
   *
   * IMPORTANT: This field works in conjunction with `transactionType`:
   * - BUY category → EXPENSE transactionType (spending money)
   * - SELL category → INCOME transactionType (receiving money)
   * See class-level documentation for detailed cash flow logic.
   */
  @Attribute(DataTypes.ENUM(...Object.values(INVESTMENT_TRANSACTION_CATEGORY)))
  @NotNull
  declare category: INVESTMENT_TRANSACTION_CATEGORY;

  /**
   * "transferNature" and "transferId" are used to move funds between different
   * accounts and don't affect income/expense stats.
   */
  @Attribute(DataTypes.ENUM(...Object.values(TRANSACTION_TRANSFER_NATURE)))
  @NotNull
  @Default(TRANSACTION_TRANSFER_NATURE.not_transfer)
  declare transferNature: CreationOptional<TRANSACTION_TRANSFER_NATURE>;

  // (hash, used to connect two transactions)
  @Attribute(DataTypes.STRING)
  declare transferId: string | null;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare createdAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Securities, 'securityId')
  declare security?: NonAttribute<Securities>;

  @BelongsTo(() => Portfolios, 'portfolioId')
  declare portfolio?: NonAttribute<Portfolios>;
}
