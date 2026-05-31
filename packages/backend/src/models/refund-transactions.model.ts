import type { RecordId } from '@bt/shared/types';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import {
  Attribute,
  BeforeCreate,
  BelongsTo,
  Index,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import TransactionSplits from './transaction-splits.model';
import Transactions from './transactions.model';
import Users from './users.model';

@Table({
  tableName: 'RefundTransactions',
  timestamps: true,
  freezeTableName: true,
})
export default class RefundTransactions extends Model<
  InferAttributes<RefundTransactions>,
  InferCreationAttributes<RefundTransactions>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  declare id: CreationOptional<string>;

  @BeforeCreate
  static generateUUIDv7(instance: RefundTransactions) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  // Can be nullish to support cases like when user has account_A in the system, he receives tx_A,
  // but in fact it's a refund for some tx_B in an "out of system" account. It is important to
  // consider that not all user real-life accounts will be present in the system
  @Attribute(DataTypes.UUID)
  @Index
  declare originalTxId: RecordId | null;

  @Attribute(DataTypes.UUID)
  @NotNull
  @Unique
  @Index
  declare refundTxId: RecordId;

  // Optional: when set, the refund applies to a specific split rather than the whole transaction
  @Attribute(DataTypes.UUID)
  declare splitId: string | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => TransactionSplits, 'splitId')
  declare split?: NonAttribute<TransactionSplits>;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @BelongsTo(() => Transactions, 'originalTxId')
  declare originalTransaction?: NonAttribute<Transactions>;

  @BelongsTo(() => Transactions, 'refundTxId')
  declare refundTransaction?: NonAttribute<Transactions>;
}

export const createRefundTransaction = async ({
  userId,
  originalTxId,
  refundTxId,
  splitId,
}: {
  userId: number;
  originalTxId: RecordId | null;
  refundTxId: RecordId;
  splitId?: string | null;
}) => {
  return RefundTransactions.create({ userId, originalTxId, refundTxId, splitId });
};
