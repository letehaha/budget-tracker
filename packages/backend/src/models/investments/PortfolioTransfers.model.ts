import { PortfolioTransferModel } from '@bt/shared/types/investments';
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
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';

import Accounts from '../Accounts.model';
import Currencies from '../Currencies.model';
import Users from '../Users.model';
import Portfolios from './Portfolios.model';

@Table({
  timestamps: true,
  tableName: 'PortfolioTransfers',
})
export default class PortfolioTransfers
  extends Model<InferAttributes<PortfolioTransfers>, InferCreationAttributes<PortfolioTransfers>>
  implements PortfolioTransferModel
{
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare fromAccountId: number | null;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare toPortfolioId: number | null;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare fromPortfolioId: number | null;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare toAccountId: number | null;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  declare amount: string;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  declare refAmount: string;

  @Attribute(DataTypes.STRING(3))
  @NotNull
  @Index
  declare currencyCode: string;

  @Attribute(DataTypes.DATEONLY)
  @NotNull
  @Index
  declare date: string;

  @Attribute(DataTypes.TEXT)
  declare description: string | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Associations
  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @BelongsTo(() => Accounts, 'fromAccountId')
  declare fromAccount?: NonAttribute<Accounts>;

  @BelongsTo(() => Accounts, 'toAccountId')
  declare toAccount?: NonAttribute<Accounts>;

  @BelongsTo(() => Portfolios, 'fromPortfolioId')
  declare fromPortfolio?: NonAttribute<Portfolios>;

  @BelongsTo(() => Portfolios, 'toPortfolioId')
  declare toPortfolio?: NonAttribute<Portfolios>;

  @BelongsTo(() => Currencies, 'currencyCode')
  declare currency?: NonAttribute<Currencies>;
}
