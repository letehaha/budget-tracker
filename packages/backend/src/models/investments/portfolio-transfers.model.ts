import { Money } from '@common/types/money';
import { MoneyColumn, moneyGetDecimal, moneySetDecimal } from '@common/types/money-column';
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';

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
    autoIncrement: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @ForeignKey(() => Users)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @ForeignKey(() => Accounts)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: true })
  fromAccountId!: number | null;

  @ForeignKey(() => Portfolios)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: true })
  toPortfolioId!: number | null;

  @ForeignKey(() => Portfolios)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: true })
  fromPortfolioId!: number | null;

  @ForeignKey(() => Accounts)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: true })
  toAccountId!: number | null;

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

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get toAmount(): Money | null {
    const raw = this.getDataValue('toAmount');
    if (raw === null || raw === undefined) return null;
    return moneyGetDecimal(this, 'toAmount');
  }
  set toAmount(val: Money | string | number | null) {
    if (val === null) {
      this.setDataValue('toAmount', null);
      return;
    }
    moneySetDecimal(this, 'toAmount', val, 10);
  }

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get refToAmount(): Money | null {
    const raw = this.getDataValue('refToAmount');
    if (raw === null || raw === undefined) return null;
    return moneyGetDecimal(this, 'refToAmount');
  }
  set refToAmount(val: Money | string | number | null) {
    if (val === null) {
      this.setDataValue('refToAmount', null);
      return;
    }
    moneySetDecimal(this, 'refToAmount', val, 10);
  }

  @BelongsTo(() => Currencies, 'toCurrencyCode')
  toCurrency?: Currencies;

  @Column({ type: DataType.JSONB, allowNull: true, defaultValue: null })
  metaData!: Record<string, unknown> | null;

  @ForeignKey(() => Transactions)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: true, defaultValue: null, onDelete: 'SET NULL' })
  transactionId!: number | null;

  @BelongsTo(() => Transactions)
  transaction?: Transactions;
}
