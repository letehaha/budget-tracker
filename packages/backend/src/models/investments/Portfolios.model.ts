import { PORTFOLIO_TYPE, PortfolioModel } from '@bt/shared/types/investments';
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
  HasMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';

import Users from '../Users.model';
import Holdings from './Holdings.model';
import InvestmentTransaction from './InvestmentTransaction.model';
import PortfolioBalances from './PortfolioBalances.model';

@Table({
  timestamps: true,
  tableName: 'Portfolios',
})
export default class Portfolios
  extends Model<InferAttributes<Portfolios>, InferCreationAttributes<Portfolios>>
  implements PortfolioModel
{
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  @Unique
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare name: string;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.ENUM(...Object.values(PORTFOLIO_TYPE)))
  @NotNull
  @Index
  @Default(PORTFOLIO_TYPE.investment)
  declare portfolioType: CreationOptional<PORTFOLIO_TYPE>;

  @Attribute(DataTypes.TEXT)
  declare description: string | null;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(true)
  declare isEnabled: CreationOptional<boolean>;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare createdAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare updatedAt: CreationOptional<Date>;

  // Associations
  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @HasMany(() => PortfolioBalances, 'portfolioId')
  declare balances?: NonAttribute<PortfolioBalances[]>;

  @HasMany(() => Holdings, 'portfolioId')
  declare holdings?: NonAttribute<Holdings[]>;

  @HasMany(() => InvestmentTransaction, 'portfolioId')
  declare investmentTransactions?: NonAttribute<InvestmentTransaction[]>;
}
