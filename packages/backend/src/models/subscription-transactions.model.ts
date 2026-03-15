import { SUBSCRIPTION_LINK_STATUS, SUBSCRIPTION_MATCH_SOURCE } from '@bt/shared/types';
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from '@sequelize/core';
import { Attribute, Default, NotNull, PrimaryKey, Table, Unique } from '@sequelize/core/decorators-legacy';

@Table({
  tableName: 'SubscriptionTransactions',
  timestamps: false,
  freezeTableName: true,
})
export default class SubscriptionTransactions extends Model<
  InferAttributes<SubscriptionTransactions>,
  InferCreationAttributes<SubscriptionTransactions>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare subscriptionId: string;

  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @NotNull
  @Unique
  declare transactionId: number;

  @Attribute(DataTypes.ENUM(...Object.values(SUBSCRIPTION_MATCH_SOURCE)))
  @NotNull
  declare matchSource: SUBSCRIPTION_MATCH_SOURCE;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare matchedAt: CreationOptional<Date>;

  @Attribute(DataTypes.ENUM(...Object.values(SUBSCRIPTION_LINK_STATUS)))
  @NotNull
  @Default(SUBSCRIPTION_LINK_STATUS.active)
  declare status: CreationOptional<SUBSCRIPTION_LINK_STATUS>;
}
