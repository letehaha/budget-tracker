import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Index,
  PrimaryKey,
} from 'sequelize-typescript';
import Portfolios from './Portfolios.model';
import Currencies from '../Currencies.model';

import { PortfolioBalanceModel } from "@bt/shared/types/investments";

@Table({
  timestamps: true,
  tableName: 'PortfolioBalances',
})
export default class PortfolioBalances extends Model implements PortfolioBalanceModel {
  @PrimaryKey
  @ForeignKey(() => Portfolios)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  portfolioId!: number;

  @PrimaryKey
  @ForeignKey(() => Currencies)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  currencyId!: number;

  @Column({ type: DataType.DECIMAL(20, 10), allowNull: false, defaultValue: '0' })
  availableCash!: string;

  @Column({ type: DataType.DECIMAL(20, 10), allowNull: false, defaultValue: '0' })
  totalCash!: string;

  @Column({ type: DataType.DECIMAL(20, 10), allowNull: false, defaultValue: '0' })
  refAvailableCash!: string;

  @Column({ type: DataType.DECIMAL(20, 10), allowNull: false, defaultValue: '0' })
  refTotalCash!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  createdAt!: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  updatedAt!: Date;

  // Associations
  @BelongsTo(() => Portfolios)
  portfolio?: Portfolios;

  @BelongsTo(() => Currencies)
  currency?: Currencies;
}
