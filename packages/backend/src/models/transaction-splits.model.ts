import { RecordId } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { moneyGetCents, moneySetCents } from '@common/types/money-column';
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

import Categories from './categories.model';
import Transactions from './transactions.model';
import Users from './users.model';

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
  declare id: CreationOptional<RecordId>;

  @BeforeCreate
  static generateUUIDv7(instance: TransactionSplits) {
    if (!instance.id) {
      instance.id = uuidv7() as RecordId;
    }
  }

  @Attribute(DataTypes.UUID)
  @NotNull
  @Index
  declare transactionId: RecordId;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.UUID)
  @NotNull
  @Index
  declare categoryId: RecordId;

  // Amount in account currency (same as transaction.amount), stored as amount*100
  @Attribute(DataTypes.BIGINT)
  @NotNull
  get amount(): Money {
    return moneyGetCents(this, 'amount');
  }
  set amount(val: Money | number) {
    moneySetCents(this, 'amount', val);
  }

  // Amount in base currency (same as transaction.refAmount), stored as amount*100
  @Attribute(DataTypes.BIGINT)
  @NotNull
  get refAmount(): Money {
    return moneyGetCents(this, 'refAmount');
  }
  set refAmount(val: Money | number) {
    moneySetCents(this, 'refAmount', val);
  }

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
  transactionId: string;
  userId: number;
  categoryId: string;
  amount: Money;
  refAmount: Money;
  note?: string | null;
}

export const bulkCreateSplits = async ({ data }: { data: CreateSplitPayload[] }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return TransactionSplits.bulkCreate(data as any, { individualHooks: true });
};

export const deleteSplitsForTransaction = async ({
  transactionId,
  userId,
}: {
  transactionId: string;
  /**
   * Optional. When omitted (callers that have already authorized via the parent
   * transaction's account), all splits for the transaction are deleted regardless
   * of which user authored each row. Required for legacy single-user callsites that
   * still scope by creator.
   */
  userId?: number;
}) => {
  const where: { transactionId: string; userId?: number } = { transactionId };
  if (userId !== undefined) where.userId = userId;
  return TransactionSplits.destroy({ where });
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
