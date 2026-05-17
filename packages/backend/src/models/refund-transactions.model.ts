import { RecordId } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import TransactionSplits from './transaction-splits.model';
import Transactions from './transactions.model';
import Users from './users.model';

@Table({
  tableName: 'RefundTransactions',
  timestamps: true,
  freezeTableName: true,
  indexes: [
    {
      fields: ['userId'],
    },
    {
      fields: ['originalTxId'],
    },
    {
      fields: ['refundTxId'],
      unique: true,
    },
  ],
})
export default class RefundTransactions extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @ForeignKey(() => Transactions)
  @Column({
    // Can be nullish to support cases like when user has account_A in the system, he receives tx_A,
    // but in fact it's a refund for some tx_B in an "out of system" account. It is important to
    // consider that not all user real-life accounts will be present in the system
    allowNull: true,
    type: DataType.UUID,
  })
  originalTxId!: RecordId | null;

  @ForeignKey(() => Transactions)
  @Column({
    allowNull: false,
    unique: true,
    type: DataType.UUID,
  })
  refundTxId!: RecordId;

  // Optional: when set, the refund applies to a specific split rather than the whole transaction
  @ForeignKey(() => TransactionSplits)
  @Column({
    allowNull: true,
    type: DataType.UUID,
  })
  splitId!: RecordId | null;

  @BelongsTo(() => TransactionSplits)
  split!: TransactionSplits;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => Transactions, 'originalTxId')
  originalTransaction!: Transactions;

  @BelongsTo(() => Transactions, 'refundTxId')
  refundTransaction!: Transactions;
}

export const createRefundTransaction = async ({
  userId,
  originalTxId,
  refundTxId,
  splitId,
}: {
  userId: number;
  originalTxId: string | null;
  refundTxId: string;
  splitId?: string | null;
}) => {
  return RefundTransactions.create({ userId, originalTxId, refundTxId, splitId });
};
