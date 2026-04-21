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
  AutoIncrement,
  BelongsTo,
  Index,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';

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
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  // Can be nullish to support cases like when user has account_A in the system, he receives tx_A,
  // but in fact it's a refund for some tx_B in an "out of system" account. It is important to
  // consider that not all user real-life accounts will be present in the system
  @Attribute(DataTypes.INTEGER)
  @Index
  declare originalTxId: number | null;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Unique
  @Index
  declare refundTxId: number;

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
  originalTxId: number | null;
  refundTxId: number;
  splitId?: string | null;
}) => {
  return RefundTransactions.create({ userId, originalTxId, refundTxId, splitId });
};
