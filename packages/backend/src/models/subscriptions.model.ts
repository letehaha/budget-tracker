import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES, SubscriptionMatchingRules } from '@bt/shared/types';
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
  BelongsToMany,
  Default,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import Accounts from './accounts.model';
import Categories from './categories.model';
import SubscriptionTransactions from './subscription-transactions.model';
import Transactions from './transactions.model';
import Users from './users.model';

@Table({
  tableName: 'Subscriptions',
  timestamps: true,
  freezeTableName: true,
})
export default class Subscriptions extends Model<
  InferAttributes<Subscriptions>,
  InferCreationAttributes<Subscriptions>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  declare id: CreationOptional<string>;

  @BeforeCreate
  static generateUUIDv7(instance: Subscriptions) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare userId: number;

  @Attribute(DataTypes.STRING(200))
  @NotNull
  declare name: string;

  @Attribute(DataTypes.ENUM({ values: Object.values(SUBSCRIPTION_TYPES) }))
  @NotNull
  @Default(SUBSCRIPTION_TYPES.subscription)
  declare type: CreationOptional<SUBSCRIPTION_TYPES>;

  @Attribute(DataTypes.INTEGER)
  get expectedAmount(): Money {
    return moneyGetCents(this, 'expectedAmount');
  }
  set expectedAmount(val: Money | number | null) {
    moneySetCents(this, 'expectedAmount', val);
  }

  @Attribute(DataTypes.STRING(3))
  declare expectedCurrencyCode: string | null;

  @Attribute(DataTypes.ENUM({ values: Object.values(SUBSCRIPTION_FREQUENCIES) }))
  @NotNull
  declare frequency: SUBSCRIPTION_FREQUENCIES;

  @Attribute(DataTypes.DATEONLY)
  @NotNull
  declare startDate: string;

  @Attribute(DataTypes.DATEONLY)
  declare endDate: string | null;

  @Attribute(DataTypes.INTEGER)
  declare accountId: number | null;

  @Attribute(DataTypes.INTEGER)
  declare categoryId: number | null;

  @Attribute(DataTypes.JSONB)
  @NotNull
  @Default({ rules: [] })
  declare matchingRules: CreationOptional<SubscriptionMatchingRules>;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(true)
  declare isActive: CreationOptional<boolean>;

  @Attribute(DataTypes.TEXT)
  declare notes: string | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @BelongsTo(() => Accounts, 'accountId')
  declare account?: NonAttribute<Accounts>;

  @BelongsTo(() => Categories, 'categoryId')
  declare category?: NonAttribute<Categories>;

  @BelongsToMany(() => Transactions, {
    through: () => SubscriptionTransactions,
    foreignKey: 'subscriptionId',
    otherKey: 'transactionId',
  })
  declare transactions?: NonAttribute<Transactions[]>;
}
