import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Index,
} from 'sequelize-typescript';
import Users from '../Users.model';
import Accounts from '../Accounts.model';
import Portfolios from './Portfolios.model';
import Currencies from '../Currencies.model';

import { Money } from '@common/types/money';
import { MoneyColumn, moneyGetDecimal, moneySetDecimal } from '@common/types/money-column';

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
  id!: number;

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
  get amount(): Money { return moneyGetDecimal(this, 'amount'); }
  set amount(val: Money | string | number) { moneySetDecimal(this, 'amount', val, 10); }

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get refAmount(): Money { return moneyGetDecimal(this, 'refAmount'); }
  set refAmount(val: Money | string | number) { moneySetDecimal(this, 'refAmount', val, 10); }

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
  createdAt!: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  updatedAt!: Date;

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

  @BelongsTo(() => Currencies)
  currency?: Currencies;
}
