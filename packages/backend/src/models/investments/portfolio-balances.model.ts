import { Money } from '@common/types/money';
import { moneyGetDecimal, moneySetDecimal } from '@common/types/money-column';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import { Attribute, BelongsTo, Default, Index, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

import Currencies from '../currencies.model';
import Portfolios from './portfolios.model';

@Table({
  timestamps: true,
  tableName: 'PortfolioBalances',
})
export default class PortfolioBalances extends Model<
  InferAttributes<PortfolioBalances>,
  InferCreationAttributes<PortfolioBalances>
> {
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
  get availableCash(): Money {
    return moneyGetDecimal(this, 'availableCash');
  }
  set availableCash(val: Money | string | number) {
    moneySetDecimal(this, 'availableCash', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  get totalCash(): Money {
    return moneyGetDecimal(this, 'totalCash');
  }
  set totalCash(val: Money | string | number) {
    moneySetDecimal(this, 'totalCash', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  get refAvailableCash(): Money {
    return moneyGetDecimal(this, 'refAvailableCash');
  }
  set refAvailableCash(val: Money | string | number) {
    moneySetDecimal(this, 'refAvailableCash', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  get refTotalCash(): Money {
    return moneyGetDecimal(this, 'refTotalCash');
  }
  set refTotalCash(val: Money | string | number) {
    moneySetDecimal(this, 'refTotalCash', val, 10);
  }

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
