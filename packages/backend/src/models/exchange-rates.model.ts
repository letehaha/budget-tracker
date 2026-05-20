import { EXCHANGE_RATE_PROVIDER_TYPE } from '@bt/shared/types';
import { Op } from 'sequelize';
import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';

import Currencies from './currencies.model';

@Table({
  timestamps: true,
  createdAt: 'date',
  updatedAt: false,
  tableName: 'ExchangeRates',
  freezeTableName: true,
})
export default class ExchangeRates extends Model {
  @ForeignKey(() => Currencies)
  @Column({ allowNull: false, type: DataType.STRING(3), primaryKey: true })
  baseCode!: string;

  @ForeignKey(() => Currencies)
  @Column({ allowNull: false, type: DataType.STRING(3), primaryKey: true })
  quoteCode!: string;

  @Column({ allowNull: false, type: DataType.DATE, primaryKey: true })
  date!: Date;

  @Column({ allowNull: false, defaultValue: 1, type: DataType.FLOAT })
  rate!: number;

  @Column({
    allowNull: false,
    type: DataType.STRING(32),
    defaultValue: EXCHANGE_RATE_PROVIDER_TYPE.UNKNOWN,
  })
  source!: EXCHANGE_RATE_PROVIDER_TYPE;
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
