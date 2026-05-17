import { RemindBeforePreset, SUBSCRIPTION_FREQUENCIES, RecordId } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { MoneyColumn, moneyGetCents, moneySetCents } from '@common/types/money-column';
import { Table, Column, Model, ForeignKey, BelongsTo, HasMany, DataType } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import Categories from './categories.model';
import PaymentReminderPeriods from './payment-reminder-periods.model';
import Subscriptions from './subscriptions.model';
import Users from './users.model';

@Table({
  tableName: 'PaymentReminders',
  timestamps: true,
  freezeTableName: true,
})
export default class PaymentReminders extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @ForeignKey(() => Subscriptions)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  subscriptionId!: RecordId | null;

  @Column({
    type: DataType.STRING(200),
    allowNull: false,
  })
  name!: string;

  @Column(MoneyColumn({ storage: 'cents', allowNull: true }))
  get expectedAmount(): Money {
    return moneyGetCents(this, 'expectedAmount');
  }
  set expectedAmount(val: Money | number | null) {
    moneySetCents(this, 'expectedAmount', val);
  }

  @Column({
    type: DataType.STRING(3),
    allowNull: true,
  })
  currencyCode!: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(SUBSCRIPTION_FREQUENCIES)),
    allowNull: true,
  })
  frequency!: SUBSCRIPTION_FREQUENCIES | null;

  @Column({
    type: DataType.SMALLINT,
    allowNull: false,
  })
  anchorDay!: number;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false,
  })
  dueDate!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  remindBefore!: RemindBeforePreset[];

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  notifyEmail!: boolean;

  @Column({
    type: DataType.SMALLINT,
    allowNull: false,
    defaultValue: 8,
  })
  preferredTime!: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: 'UTC',
  })
  timezone!: string;

  @ForeignKey(() => Categories)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  categoryId!: RecordId | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  notes!: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  isActive!: boolean;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => Subscriptions)
  subscription!: Subscriptions | null;

  @BelongsTo(() => Categories)
  category!: Categories | null;

  @HasMany(() => PaymentReminderPeriods, { foreignKey: 'reminderId' })
  periods!: PaymentReminderPeriods[];
}
