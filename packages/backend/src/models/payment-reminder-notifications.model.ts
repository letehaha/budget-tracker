import { PaymentReminderNotificationModel, RemindBeforePreset, RecordId } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import PaymentReminderPeriods from './payment-reminder-periods.model';

@Table({
  tableName: 'PaymentReminderNotifications',
  timestamps: false,
  freezeTableName: true,
})
export default class PaymentReminderNotifications extends Model implements PaymentReminderNotificationModel {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  @ForeignKey(() => PaymentReminderPeriods)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  periodId!: RecordId;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  remindBeforePreset!: RemindBeforePreset;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  sentAt!: Date;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  emailSent!: boolean;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  emailError!: string | null;

  @BelongsTo(() => PaymentReminderPeriods, { foreignKey: 'periodId', onDelete: 'CASCADE' })
  period!: PaymentReminderPeriods;
}
