import {
  Table,
  Column,
  Model,
  ForeignKey,
  BelongsTo,
  DataType,
  Length,
  BeforeCreate,
} from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';
import Categories from './Categories.model';
import Transactions from './Transactions.model';
import Users from './Users.model';

@Table({
  tableName: 'TransactionSplits',
  timestamps: false,
  freezeTableName: true,
  indexes: [
    {
      fields: ['transactionId'],
    },
    {
      fields: ['userId'],
    },
    {
      fields: ['categoryId'],
    },
    {
      fields: ['transactionId', 'categoryId'],
    },
  ],
})
export default class TransactionSplits extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
  })
  declare id: string;

  @BeforeCreate
  static generateUUIDv7(instance: TransactionSplits) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @ForeignKey(() => Transactions)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  transactionId!: number;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @ForeignKey(() => Categories)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  categoryId!: number;

  // Amount in account currency (same as transaction.amount), stored as amount*100
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  amount!: number;

  // Amount in base currency (same as transaction.refAmount), stored as amount*100
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  refAmount!: number;

  // Optional per-split note, max 100 chars
  @Length({ max: 100 })
  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  note!: string | null;

  @BelongsTo(() => Transactions)
  transaction!: Transactions;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => Categories)
  category!: Categories;
}

// Helper functions for working with splits

export interface CreateSplitPayload {
  transactionId: number;
  userId: number;
  categoryId: number;
  amount: number;
  refAmount: number;
  note?: string | null;
}

export const bulkCreateSplits = async ({
  data,
}: {
  data: CreateSplitPayload[];
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return TransactionSplits.bulkCreate(data as any, { individualHooks: true });
};

export const getSplitsForTransaction = async ({
  transactionId,
  userId,
}: {
  transactionId: number;
  userId: number;
}) => {
  return TransactionSplits.findAll({
    where: { transactionId, userId },
    include: [{ model: Categories, as: 'category' }],
  });
};

export const deleteSplitsForTransaction = async ({
  transactionId,
  userId,
}: {
  transactionId: number;
  userId: number;
}) => {
  return TransactionSplits.destroy({
    where: { transactionId, userId },
  });
};

export const deleteSplitById = async ({
  id,
  userId,
}: {
  id: string;
  userId: number;
}) => {
  return TransactionSplits.destroy({
    where: { id, userId },
  });
};

export const getSplitById = async ({
  id,
  userId,
}: {
  id: string;
  userId: number;
}) => {
  return TransactionSplits.findOne({
    where: { id, userId },
    include: [{ model: Categories, as: 'category' }],
  });
};
