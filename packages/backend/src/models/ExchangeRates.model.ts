import { DataTypes, InferAttributes, InferCreationAttributes, Model, Op } from '@sequelize/core';
import { Attribute, Default, Index, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

import Currencies from './Currencies.model';

@Table({
  timestamps: true,
  createdAt: 'date',
  updatedAt: false,
  tableName: 'ExchangeRates',
  freezeTableName: true,
})
export default class ExchangeRates extends Model<
  InferAttributes<ExchangeRates>,
  InferCreationAttributes<ExchangeRates>
> {
  @Attribute(DataTypes.STRING(3))
  @PrimaryKey
  @NotNull
  @Index
  declare baseCode: string;

  @Attribute(DataTypes.STRING(3))
  @PrimaryKey
  @NotNull
  @Index
  declare quoteCode: string;

  @Attribute(DataTypes.DATE)
  @PrimaryKey
  @NotNull
  declare date: Date;

  @Attribute(DataTypes.FLOAT)
  @NotNull
  @Default(1)
  declare rate: number;
}

export async function getRatesForCurrenciesPairs(
  pairs: {
    baseCode: string;
    quoteCode: string;
  }[],
) {
  return ExchangeRates.findAll({
    where: {
      [Op.or]: pairs.map((item) => ({
        [Op.and]: {
          baseCode: item.baseCode,
          quoteCode: item.quoteCode,
        },
      })),
    },
    raw: true,
  });
}
