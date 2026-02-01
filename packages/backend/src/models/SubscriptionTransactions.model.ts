import { SUBSCRIPTION_LINK_STATUS, SUBSCRIPTION_MATCH_SOURCE } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';
import Subscriptions from './Subscriptions.model';
import Transactions from './Transactions.model';

@Table({
  tableName: 'SubscriptionTransactions',
  timestamps: false,
  freezeTableName: true,
})
export default class SubscriptionTransactions extends Model {
  @ForeignKey(() => Subscriptions)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
  })
  subscriptionId!: string;

  @ForeignKey(() => Transactions)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    primaryKey: true,
    unique: true,
  })
  transactionId!: number;

  @Column({
    type: DataType.ENUM(...Object.values(SUBSCRIPTION_MATCH_SOURCE)),
    allowNull: false,
  })
  matchSource!: SUBSCRIPTION_MATCH_SOURCE;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  matchedAt!: Date;

  @Column({
    type: DataType.ENUM(...Object.values(SUBSCRIPTION_LINK_STATUS)),
    allowNull: false,
    defaultValue: SUBSCRIPTION_LINK_STATUS.active,
  })
  status!: SUBSCRIPTION_LINK_STATUS;
}
