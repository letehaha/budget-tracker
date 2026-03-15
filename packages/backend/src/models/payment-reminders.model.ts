import { RemindBeforePreset, SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { moneyGetCents, moneySetCents } from '@common/types/money-column';
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
  HasMany,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
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
export default class PaymentReminders extends Model<
  InferAttributes<PaymentReminders>,
  InferCreationAttributes<PaymentReminders>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  declare id: CreationOptional<string>;

  @BeforeCreate
  static generateUUIDv7(instance: PaymentReminders) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare userId: number;

  @Attribute(DataTypes.UUID)
  declare subscriptionId: string | null;

  @Attribute(DataTypes.STRING(200))
  @NotNull
  declare name: string;

  @Attribute(DataTypes.INTEGER)
  get expectedAmount(): Money {
    return moneyGetCents(this, 'expectedAmount');
  }
  set expectedAmount(val: Money | number | null) {
    moneySetCents(this, 'expectedAmount', val);
  }

  @Attribute(DataTypes.STRING(3))
  declare currencyCode: string | null;

  @Attribute(DataTypes.ENUM({ values: Object.values(SUBSCRIPTION_FREQUENCIES) }))
  declare frequency: SUBSCRIPTION_FREQUENCIES | null;

  @Attribute(DataTypes.SMALLINT)
  @NotNull
  declare anchorDay: number;

  @Attribute(DataTypes.DATEONLY)
  @NotNull
  declare dueDate: string;

  @Attribute(DataTypes.JSONB)
  @NotNull
  @Default([])
  declare remindBefore: CreationOptional<RemindBeforePreset[]>;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(false)
  declare notifyEmail: CreationOptional<boolean>;

  @Attribute(DataTypes.SMALLINT)
  @NotNull
  @Default(8)
  declare preferredTime: CreationOptional<number>;

  @Attribute(DataTypes.STRING(50))
  @NotNull
  @Default('UTC')
  declare timezone: CreationOptional<string>;

  @Attribute(DataTypes.INTEGER)
  declare categoryId: number | null;

  @Attribute(DataTypes.TEXT)
  declare notes: string | null;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(true)
  declare isActive: CreationOptional<boolean>;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @BelongsTo(() => Subscriptions, 'subscriptionId')
  declare subscription?: NonAttribute<Subscriptions | null>;

  @BelongsTo(() => Categories, 'categoryId')
  declare category?: NonAttribute<Categories | null>;

  @HasMany(() => PaymentReminderPeriods, 'reminderId')
  declare periods?: NonAttribute<PaymentReminderPeriods[]>;
}
