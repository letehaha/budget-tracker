import {
  SubscriptionPeriodModel,
  SUBSCRIPTION_PERIOD_STATUSES,
  SubscriptionPeriodStatus,
  RecordId,
} from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';

import Subscriptions from './subscriptions.model';
import Transactions from './transactions.model';

@Table({
  tableName: 'SubscriptionPeriods',
  timestamps: true,
  freezeTableName: true,
})
export default class SubscriptionPeriods extends Model implements SubscriptionPeriodModel {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Subscriptions)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  subscriptionId!: RecordId;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false,
  })
  dueDate!: string;

  // STRING(50) not DataType.ENUM — TS-side SUBSCRIPTION_PERIOD_STATUSES enum
  // enforces the allowed set without requiring a DB migration on each status change.
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: SUBSCRIPTION_PERIOD_STATUSES.upcoming,
  })
  status!: SubscriptionPeriodStatus;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  paidAt!: Date | null;

  @ForeignKey(() => Transactions)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  transactionId!: RecordId | null;

  // True when `transactionId` points at a transaction the app generated for this
  // period (CREATE-mode pay), false when the user linked their own (LINK-mode) or
  // the period is unpaid. Reverting deletes only an app-generated transaction.
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  transactionAutoCreated!: boolean;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  notes!: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Subscriptions, { foreignKey: 'subscriptionId', onDelete: 'CASCADE' })
  subscription!: Subscriptions;

  @BelongsTo(() => Transactions, { foreignKey: 'transactionId', onDelete: 'SET NULL' })
  transaction!: Transactions | null;
}
