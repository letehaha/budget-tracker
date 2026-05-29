import { RecordId } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { MoneyColumn, moneyGetDecimal, moneySetDecimal } from '@common/types/money-column';
import { BelongsTo, Column, DataType, ForeignKey, Index, Model, Table } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import Currencies from '../currencies.model';
import Transactions from '../transactions.model';
import VentureEvents from './venture-events.model';

@Table({
  timestamps: true,
  tableName: 'VentureEventLinks',
})
export default class VentureEventLinks extends Model {
  @Column({
    primaryKey: true,
    unique: true,
    allowNull: false,
    type: DataType.UUID,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  @ForeignKey(() => VentureEvents)
  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  ventureEventId!: RecordId;

  @ForeignKey(() => Transactions)
  @Index
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  transactionId!: RecordId;

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10 }))
  get amount(): Money {
    return moneyGetDecimal(this, 'amount');
  }
  set amount(val: Money | string | number) {
    moneySetDecimal(this, 'amount', val, 10);
  }

  @ForeignKey(() => Currencies)
  @Index
  @Column({ type: DataType.STRING(3), allowNull: false })
  currencyCode!: string;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  linkedAt!: Date;

  @Column({ type: DataType.JSONB, allowNull: true, defaultValue: null })
  metaData!: Record<string, unknown> | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare updatedAt: Date;

  @BelongsTo(() => VentureEvents)
  event?: VentureEvents;

  @BelongsTo(() => Transactions)
  transaction?: Transactions;

  @BelongsTo(() => Currencies, 'currencyCode')
  currency?: Currencies;
}
