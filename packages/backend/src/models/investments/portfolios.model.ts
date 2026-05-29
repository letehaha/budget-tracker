import { RecordId } from '@bt/shared/types';
import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
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
  BeforeCreate,
  BelongsTo,
  Default,
  HasMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import Users from '../users.model';
import Holdings from './holdings.model';
import InvestmentTransaction from './investment-transaction.model';
import PortfolioBalances from './portfolio-balances.model';

@Table({
  timestamps: true,
  paranoid: true,
  tableName: 'Portfolios',
})
export default class Portfolios extends Model<InferAttributes<Portfolios>, InferCreationAttributes<Portfolios>> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @Unique
  declare id: CreationOptional<RecordId>;

  @BeforeCreate
  static generateUUIDv7(instance: Portfolios) {
    if (!instance.id) {
      instance.id = uuidv7() as RecordId;
    }
  }

  @Attribute(DataTypes.STRING)
  @NotNull
  declare name: string;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.STRING)
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

  @Attribute(DataTypes.DATE)
  declare deletedAt: Date | null;

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
