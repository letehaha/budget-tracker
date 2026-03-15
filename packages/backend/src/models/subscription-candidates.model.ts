import { SUBSCRIPTION_CANDIDATE_STATUS, SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
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

import Accounts from './accounts.model';
import Subscriptions from './subscriptions.model';
import Users from './users.model';

@Table({
  tableName: 'SubscriptionCandidates',
  timestamps: false,
  freezeTableName: true,
})
export default class SubscriptionCandidates extends Model<
  InferAttributes<SubscriptionCandidates>,
  InferCreationAttributes<SubscriptionCandidates>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  declare id: CreationOptional<string>;

  @BeforeCreate
  static generateUUIDv7(instance: SubscriptionCandidates) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare userId: number;

  @Attribute(DataTypes.STRING(200))
  @NotNull
  declare suggestedName: string;

  @Attribute(DataTypes.ENUM({ values: Object.values(SUBSCRIPTION_FREQUENCIES) }))
  @NotNull
  declare detectedFrequency: SUBSCRIPTION_FREQUENCIES;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare averageAmount: number;

  @Attribute(DataTypes.STRING(3))
  @NotNull
  declare currencyCode: string;

  @Attribute(DataTypes.INTEGER)
  declare accountId: number | null;

  @Attribute(DataTypes.ARRAY(DataTypes.INTEGER))
  @NotNull
  @Default([])
  declare sampleTransactionIds: CreationOptional<number[]>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare occurrenceCount: number;

  @Attribute(DataTypes.FLOAT)
  @NotNull
  declare confidenceScore: number;

  @Attribute(DataTypes.FLOAT)
  @NotNull
  declare medianIntervalDays: number;

  @Attribute(DataTypes.ENUM({ values: Object.values(SUBSCRIPTION_CANDIDATE_STATUS) }))
  @NotNull
  @Default(SUBSCRIPTION_CANDIDATE_STATUS.pending)
  declare status: CreationOptional<SUBSCRIPTION_CANDIDATE_STATUS>;

  @Attribute(DataTypes.UUID)
  declare subscriptionId: string | null;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare detectedAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  declare lastOccurrenceAt: Date | null;

  @Attribute(DataTypes.DATE)
  declare resolvedAt: Date | null;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @BelongsTo(() => Accounts, 'accountId')
  declare account?: NonAttribute<Accounts>;

  @BelongsTo(() => Subscriptions, 'subscriptionId')
  declare subscription?: NonAttribute<Subscriptions>;
}
