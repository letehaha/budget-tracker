import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { Money } from '@common/types/money';
import { MoneyColumn, moneyGetDecimal, moneySetDecimal } from '@common/types/money-column';
import { Table, Column, Model, ForeignKey, DataType, BelongsTo, Index } from 'sequelize-typescript';

import Portfolios from './Portfolios.model';
import Securities from './Securities.model';

@Table({
  timestamps: true,
  tableName: 'InvestmentTransactions',
})
export default class InvestmentTransaction extends Model {
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

  @Column({
    primaryKey: true,
    unique: true,
    allowNull: false,
    autoIncrement: true,
    type: DataType.INTEGER,
  })
  id!: number;

  @ForeignKey(() => Securities)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  securityId!: number;

  // New portfolioId field for portfolio migration
  @ForeignKey(() => Portfolios)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  portfolioId!: number;

  /**
   * The transaction type representing cash flow direction:
   * - EXPENSE: Money leaving your account (BUY transactions)
   * - INCOME: Money entering your account (SELL transactions)
   * See class-level documentation above for detailed explanation.
   */
  @Column({
    type: DataType.ENUM(...Object.values(TRANSACTION_TYPES)),
    allowNull: false,
  })
  transactionType!: TRANSACTION_TYPES;

  @Index
  @Column({ type: DataType.DATEONLY, allowNull: false })
  date!: string;

  /**
   * A descriptive name or title for the investment transaction, providing a
   * quick overview of the transaction's nature. Same as `note` in `Transactions`
   */
  @Column({ type: DataType.STRING(2000), allowNull: true })
  name!: string | null;

  /**
   * The monetary value involved in the transaction. Depending on the context,
   * this could represent the cost, sale proceeds, or other financial values
   * associated with the transaction. Calculated as quantity * price + fees
   */
  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get amount(): Money {
    return moneyGetDecimal(this, 'amount');
  }
  set amount(val: Money | string | number) {
    moneySetDecimal(this, 'amount', val, 10);
  }
  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get refAmount(): Money {
    return moneyGetDecimal(this, 'refAmount');
  }
  set refAmount(val: Money | string | number) {
    moneySetDecimal(this, 'refAmount', val, 10);
  }

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get fees(): Money {
    return moneyGetDecimal(this, 'fees');
  }
  set fees(val: Money | string | number) {
    moneySetDecimal(this, 'fees', val, 10);
  }
  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get refFees(): Money {
    return moneyGetDecimal(this, 'refFees');
  }
  set refFees(val: Money | string | number) {
    moneySetDecimal(this, 'refFees', val, 10);
  }

  /**
   * * The quantity of the security involved in the transaction. This is crucial
   * for tracking the changes in holdings as a result of the transaction.
   */
  @Column(MoneyColumn({ storage: 'decimal', precision: 36, scale: 18 }))
  get quantity(): Money {
    return moneyGetDecimal(this, 'quantity');
  }
  set quantity(val: Money | string | number) {
    moneySetDecimal(this, 'quantity', val, 18);
  }

  /**
   * The price per unit of the security at the time of the transaction.
   * This is used to calculate the total transaction amount and update the cost
   * basis of the holding.
   */
  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get price(): Money {
    return moneyGetDecimal(this, 'price');
  }
  set price(val: Money | string | number) {
    moneySetDecimal(this, 'price', val, 10);
  }
  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get refPrice(): Money {
    return moneyGetDecimal(this, 'refPrice');
  }
  set refPrice(val: Money | string | number) {
    moneySetDecimal(this, 'refPrice', val, 10);
  }

  /**
   * The ISO currency code or standard cryptocurrency code representing the currency
   * in which the transaction was conducted. For cryptocurrencies, this code refers to
   * the specific cryptocurrency involved (e.g., BTC for Bitcoin, ETH for Ethereum).
   */
  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'USD' })
  currencyCode!: string;

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
  @Column({
    type: DataType.ENUM(...Object.values(INVESTMENT_TRANSACTION_CATEGORY)),
    allowNull: false,
  })
  category!: INVESTMENT_TRANSACTION_CATEGORY;

  /**
   * "transferNature" and "transferId" are used to move funds between different
   * accounts and don't affect income/expense stats.
   */
  @Column({
    type: DataType.ENUM(...Object.values(TRANSACTION_TRANSFER_NATURE)),
    allowNull: false,
    defaultValue: TRANSACTION_TRANSFER_NATURE.not_transfer,
  })
  transferNature!: TRANSACTION_TRANSFER_NATURE;

  // (hash, used to connect two transactions)
  @Column({ type: DataType.STRING, allowNull: true })
  transferId!: string | null;

  @Column({ type: DataType.DATE, allowNull: false })
  createdAt!: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  updatedAt!: Date;

  @BelongsTo(() => Securities)
  security!: Securities;

  @BelongsTo(() => Portfolios)
  portfolio?: Portfolios;
}
