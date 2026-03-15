import { PortfolioBalanceModel } from '@bt/shared/types/investments';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import { Attribute, BelongsTo, Default, Index, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

import Currencies from '../Currencies.model';
import Portfolios from './Portfolios.model';

@Table({
  timestamps: true,
  tableName: 'PortfolioBalances',
})
export default class PortfolioBalances
  extends Model<InferAttributes<PortfolioBalances>, InferCreationAttributes<PortfolioBalances>>
  implements PortfolioBalanceModel
{
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @NotNull
  @Index
  declare portfolioId: number;

  @Attribute(DataTypes.STRING(3))
  @PrimaryKey
  @NotNull
  @Index
  declare currencyCode: string;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  declare availableCash: string;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  declare totalCash: string;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  declare refAvailableCash: string;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  declare refTotalCash: string;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare createdAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare updatedAt: CreationOptional<Date>;

  // Associations
  @BelongsTo(() => Portfolios, 'portfolioId')
  declare portfolio?: NonAttribute<Portfolios>;

  @BelongsTo(() => Currencies, 'currencyCode')
  declare currency?: NonAttribute<Currencies>;
}
