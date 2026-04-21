import { PaymentReminderStatus, PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
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
  BeforeCreate,
  BelongsTo,
  Default,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import PaymentReminders from './payment-reminders.model';
import Transactions from './transactions.model';

@Table({
  tableName: 'PaymentReminderPeriods',
  timestamps: true,
  freezeTableName: true,
})
export default class PaymentReminderPeriods extends Model<
  InferAttributes<PaymentReminderPeriods>,
  InferCreationAttributes<PaymentReminderPeriods>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  declare id: CreationOptional<string>;

  @BeforeCreate
  static generateUUIDv7(instance: PaymentReminderPeriods) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @Attribute(DataTypes.UUID)
  @NotNull
  declare reminderId: string;

  @Attribute(DataTypes.DATEONLY)
  @NotNull
  declare dueDate: string;

  @Attribute(DataTypes.ENUM({ values: Object.values(PAYMENT_REMINDER_STATUSES) }))
  @NotNull
  @Default(PAYMENT_REMINDER_STATUSES.upcoming)
  declare status: CreationOptional<PaymentReminderStatus>;

  @Attribute(DataTypes.DATE)
  declare paidAt: Date | null;

  @Attribute(DataTypes.INTEGER)
  declare transactionId: number | null;

  @Attribute(DataTypes.TEXT)
  declare notes: string | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => PaymentReminders, 'reminderId')
  declare reminder?: NonAttribute<PaymentReminders>;

  @BelongsTo(() => Transactions, 'transactionId')
  declare transaction?: NonAttribute<Transactions | null>;
}
