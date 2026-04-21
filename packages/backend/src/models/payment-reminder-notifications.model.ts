import { RemindBeforePreset } from '@bt/shared/types';
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

import PaymentReminderPeriods from './payment-reminder-periods.model';

@Table({
  tableName: 'PaymentReminderNotifications',
  timestamps: false,
  freezeTableName: true,
})
export default class PaymentReminderNotifications extends Model<
  InferAttributes<PaymentReminderNotifications>,
  InferCreationAttributes<PaymentReminderNotifications>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  declare id: CreationOptional<string>;

  @BeforeCreate
  static generateUUIDv7(instance: PaymentReminderNotifications) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @Attribute(DataTypes.UUID)
  @NotNull
  declare periodId: string;

  @Attribute(DataTypes.STRING(20))
  @NotNull
  declare remindBeforePreset: RemindBeforePreset;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare sentAt: CreationOptional<Date>;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(false)
  declare emailSent: CreationOptional<boolean>;

  @Attribute(DataTypes.TEXT)
  declare emailError: string | null;

  @BelongsTo(() => PaymentReminderPeriods, 'periodId')
  declare period?: NonAttribute<PaymentReminderPeriods>;
}
