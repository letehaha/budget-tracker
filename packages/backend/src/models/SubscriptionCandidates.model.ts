import {
  SUBSCRIPTION_CANDIDATE_STATUS,
  SUBSCRIPTION_FREQUENCIES,
} from '@bt/shared/types';
import {
  Table,
  Column,
  Model,
  ForeignKey,
  BelongsTo,
  DataType,
  BeforeCreate,
} from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';
import Accounts from './Accounts.model';
import Subscriptions from './Subscriptions.model';
import Users from './Users.model';

@Table({
  tableName: 'SubscriptionCandidates',
  timestamps: false,
  freezeTableName: true,
})
export default class SubscriptionCandidates extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
  })
  declare id: string;

  @BeforeCreate
  static generateUUIDv7(instance: SubscriptionCandidates) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.STRING(200),
    allowNull: false,
  })
  suggestedName!: string;

  @Column({
    type: DataType.ENUM(...Object.values(SUBSCRIPTION_FREQUENCIES)),
    allowNull: false,
  })
  detectedFrequency!: SUBSCRIPTION_FREQUENCIES;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    comment: 'Average amount in cents',
  })
  averageAmount!: number;

  @Column({
    type: DataType.STRING(3),
    allowNull: false,
  })
  currencyCode!: string;

  @ForeignKey(() => Accounts)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  accountId!: number | null;

  @Column({
    type: DataType.ARRAY(DataType.INTEGER),
    allowNull: false,
    defaultValue: [],
  })
  sampleTransactionIds!: number[];

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  occurrenceCount!: number;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
  })
  confidenceScore!: number;

  @Column({
    type: DataType.FLOAT,
    allowNull: false,
  })
  medianIntervalDays!: number;

  @Column({
    type: DataType.ENUM(...Object.values(SUBSCRIPTION_CANDIDATE_STATUS)),
    allowNull: false,
    defaultValue: SUBSCRIPTION_CANDIDATE_STATUS.pending,
  })
  status!: SUBSCRIPTION_CANDIDATE_STATUS;

  @ForeignKey(() => Subscriptions)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  subscriptionId!: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  detectedAt!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  lastOccurrenceAt!: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  resolvedAt!: Date | null;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => Accounts)
  account!: Accounts;

  @BelongsTo(() => Subscriptions)
  subscription!: Subscriptions;
}
