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
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import Categories from './Categories.model';
import Transactions from './Transactions.model';
import Users from './Users.model';

@Table({
  tableName: 'TransactionSplits',
  timestamps: false,
  freezeTableName: true,
  indexes: [
    // Composite index for efficient category-based queries within transactions
    {
      fields: ['transactionId', 'categoryId'],
    },
  ],
})
export default class TransactionSplits extends Model<
  InferAttributes<TransactionSplits>,
  InferCreationAttributes<TransactionSplits>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  declare id: CreationOptional<string>;

  @BeforeCreate
  static generateUUIDv7(instance: TransactionSplits) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare transactionId: number;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare categoryId: number;

  // Amount in account currency (same as transaction.amount), stored as amount*100
  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare amount: number;

  // Amount in base currency (same as transaction.refAmount), stored as amount*100
  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare refAmount: number;

  // Optional per-split note, max 100 chars
  @Attribute(DataTypes.STRING(100))
  declare note: string | null;

  @BelongsTo(() => Transactions, 'transactionId')
  declare transaction?: NonAttribute<Transactions>;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @BelongsTo(() => Categories, 'categoryId')
  declare category?: NonAttribute<Categories>;
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

export const bulkCreateSplits = async ({ data }: { data: CreateSplitPayload[] }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return TransactionSplits.bulkCreate(data as any, { individualHooks: true });
};

export const getSplitsForTransaction = async ({ transactionId, userId }: { transactionId: number; userId: number }) => {
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

export const deleteSplitById = async ({ id, userId }: { id: string; userId: number }) => {
  return TransactionSplits.destroy({
    where: { id, userId },
  });
};

export const getSplitById = async ({ id, userId }: { id: string; userId: number }) => {
  return TransactionSplits.findOne({
    where: { id, userId },
    include: [{ model: Categories, as: 'category' }],
  });
};
