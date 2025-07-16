import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  Index,
} from 'sequelize-typescript';
import Users from '../Users.model';
import PortfolioBalances from './PortfolioBalances.model';
import Holdings from './Holdings.model';
import InvestmentTransaction from './InvestmentTransaction.model';
import { PORTFOLIO_TYPE, PortfolioModel } from '@bt/shared/types/investments';

@Table({
  timestamps: true,
  tableName: 'Portfolios',
})
export default class Portfolios extends Model implements PortfolioModel {
  @Column({
    primaryKey: true,
    unique: true,
    allowNull: false,
    autoIncrement: true,
    type: DataType.INTEGER,
  })
  id!: number;

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
  createdAt!: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  updatedAt!: Date;

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
