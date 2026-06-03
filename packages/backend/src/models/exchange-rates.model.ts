import { EXCHANGE_RATE_PROVIDER_TYPE } from '@bt/shared/types';
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
