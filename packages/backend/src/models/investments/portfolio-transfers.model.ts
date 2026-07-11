import { RecordId } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { MoneyField } from '@common/types/money-column';
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import Accounts from '../accounts.model';
import Currencies from '../currencies.model';
import Transactions from '../transactions.model';
import Users from '../users.model';
import Portfolios from './portfolios.model';

@Table({
  timestamps: true,
  tableName: 'PortfolioTransfers',
})
export default class PortfolioTransfers extends Model {
  @Column({
    primaryKey: true,
    unique: true,
    allowNull: false,
    type: DataType.UUID,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @ForeignKey(() => Accounts)
  @Index
  @Column({ type: DataType.UUID, allowNull: true })
  fromAccountId!: RecordId | null;

  @ForeignKey(() => Portfolios)
  @Index
  @Column({ type: DataType.UUID, allowNull: true })
  toPortfolioId!: RecordId | null;

  @ForeignKey(() => Portfolios)
  @Index
  @Column({ type: DataType.UUID, allowNull: true })
  fromPortfolioId!: RecordId | null;

  @ForeignKey(() => Accounts)
  @Index
  @Column({ type: DataType.UUID, allowNull: true })
  toAccountId!: RecordId | null;

  @MoneyField({ storage: 'decimal', precision: 20, scale: 10 })
  declare amount: Money;

  @MoneyField({ storage: 'decimal', precision: 20, scale: 10 })
  declare refAmount: Money;

  @ForeignKey(() => Currencies)
  @Index
  @Column({ type: DataType.STRING(3), allowNull: false })
  currencyCode!: string;

  @Index
  @Column({ type: DataType.DATEONLY, allowNull: false })
  date!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  description!: string | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare updatedAt: Date;

  // Associations
  @BelongsTo(() => Users)
  user?: Users;

  @BelongsTo(() => Accounts, 'fromAccountId')
  fromAccount?: Accounts;

  @BelongsTo(() => Accounts, 'toAccountId')
  toAccount?: Accounts;

  @BelongsTo(() => Portfolios, 'fromPortfolioId')
  fromPortfolio?: Portfolios;

  @BelongsTo(() => Portfolios, 'toPortfolioId')
  toPortfolio?: Portfolios;

  @BelongsTo(() => Currencies, 'currencyCode')
  currency?: Currencies;

  @ForeignKey(() => Currencies)
  @Index
  @Column({ type: DataType.STRING(3), allowNull: true, defaultValue: null })
  toCurrencyCode!: string | null;

  @MoneyField({ storage: 'decimal', precision: 20, scale: 10 })
  declare toAmount: Money | null;

  @MoneyField({ storage: 'decimal', precision: 20, scale: 10 })
  declare refToAmount: Money | null;

  @BelongsTo(() => Currencies, 'toCurrencyCode')
  toCurrency?: Currencies;

  @Column({ type: DataType.JSONB, allowNull: true, defaultValue: null })
  metaData!: Record<string, unknown> | null;

  @ForeignKey(() => Transactions)
  @Index
  @Column({ type: DataType.UUID, allowNull: true, defaultValue: null, onDelete: 'SET NULL' })
  transactionId!: RecordId | null;

  @BelongsTo(() => Transactions)
  transaction?: Transactions;
}
