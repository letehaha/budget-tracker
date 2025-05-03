import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';
import Transactions from './Transactions.model';
import Users from './Users.model';

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
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

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
    type: DataType.INTEGER,
  })
  originalTxId!: number;

  @ForeignKey(() => Transactions)
  @Column({
    allowNull: false,
    unique: true,
    type: DataType.INTEGER,
  })
  refundTxId!: number;

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
}: {
  userId: number;
  originalTxId: number | null;
  refundTxId: number;
}) => {
  return RefundTransactions.create({ userId, originalTxId, refundTxId });
};

export const getRefundsForTransaction = async ({ originalTxId, userId }: { originalTxId: number; userId: number }) => {
  return RefundTransactions.findAll({
    where: { originalTxId: originalTxId, userId },
    include: [{ model: Transactions, as: 'refundTransaction' }],
  });
};

export const bulkCreateRefundTransactions = (
  {
    data,
  }: {
    data: Array<{
      userId: number;
      originalTxId: number | null;
      refundTxId: number;
    }>;
  },
  {
    validate = true,
    returning = false,
  }: {
    validate?: boolean;
    returning?: boolean;
  },
) => {
  return RefundTransactions.bulkCreate(data, {
    validate,
    returning,
  });
};
