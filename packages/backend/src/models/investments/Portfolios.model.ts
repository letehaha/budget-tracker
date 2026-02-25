import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, Index } from 'sequelize-typescript';

import Users from '../Users.model';
import Holdings from './Holdings.model';
import InvestmentTransaction from './InvestmentTransaction.model';
import PortfolioBalances from './PortfolioBalances.model';

@Table({
  timestamps: true,
  tableName: 'Portfolios',
})
export default class Portfolios extends Model {
  @Column({
    primaryKey: true,
    unique: true,
    allowNull: false,
    autoIncrement: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @Column({ type: DataType.STRING, allowNull: false })
  name!: string;

  @ForeignKey(() => Users)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Index
  @Column({
    type: DataType.ENUM(...Object.values(PORTFOLIO_TYPE)),
    allowNull: false,
    defaultValue: PORTFOLIO_TYPE.investment,
  })
  portfolioType!: PORTFOLIO_TYPE;

  @Column({ type: DataType.TEXT, allowNull: true })
  description!: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isEnabled!: boolean;

  @Column({ type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare updatedAt: Date;

  // Associations
  @BelongsTo(() => Users)
  user?: Users;

  @HasMany(() => PortfolioBalances)
  balances?: PortfolioBalances[];

  @HasMany(() => Holdings)
  holdings?: Holdings[];

  @HasMany(() => InvestmentTransaction)
  investmentTransactions?: InvestmentTransaction[];
}
