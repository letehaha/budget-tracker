import { PaymentReminderPeriodModel, PaymentReminderStatus, PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType, BeforeCreate } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import PaymentReminders from './payment-reminders.model';
import Transactions from './Transactions.model';

@Table({
  tableName: 'PaymentReminderPeriods',
  timestamps: true,
  freezeTableName: true,
})
export default class PaymentReminderPeriods extends Model implements PaymentReminderPeriodModel {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
  })
  declare id: string;

  @BeforeCreate
  static generateUUIDv7(instance: PaymentReminderPeriods) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @ForeignKey(() => PaymentReminders)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  reminderId!: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false,
  })
  dueDate!: string;

  @Column({
    type: DataType.ENUM(...Object.values(PAYMENT_REMINDER_STATUSES)),
    allowNull: false,
    defaultValue: PAYMENT_REMINDER_STATUSES.upcoming,
  })
  status!: PaymentReminderStatus;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  paidAt!: Date | null;

  @ForeignKey(() => Transactions)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  transactionId!: number | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  notes!: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => PaymentReminders, { foreignKey: 'reminderId', onDelete: 'CASCADE' })
  reminder!: PaymentReminders;

  @BelongsTo(() => Transactions, { foreignKey: 'transactionId', onDelete: 'SET NULL' })
  transaction!: Transactions | null;
}
