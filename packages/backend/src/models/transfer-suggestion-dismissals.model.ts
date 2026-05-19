import { RecordId } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, DataType, BelongsTo } from 'sequelize-typescript';

import Transactions from './transactions.model';
import Users from './users.model';

@Table({
  tableName: 'TransferSuggestionDismissals',
  freezeTableName: true,
  timestamps: false,
  // userId is the leading column of the composite PK, so a separate index is redundant
})
export default class TransferSuggestionDismissals extends Model {
  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    primaryKey: true,
  })
  userId!: number;

  @ForeignKey(() => Transactions)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
  })
  expenseTransactionId!: RecordId;

  @ForeignKey(() => Transactions)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
  })
  incomeTransactionId!: RecordId;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => Transactions, 'expenseTransactionId')
  expenseTransaction!: Transactions;

  @BelongsTo(() => Transactions, 'incomeTransactionId')
  incomeTransaction!: Transactions;
}

export async function createDismissal({
  userId,
  expenseTransactionId,
  incomeTransactionId,
}: {
  userId: number;
  expenseTransactionId: string;
  incomeTransactionId: string;
}) {
  return TransferSuggestionDismissals.findOrCreate({
    where: { userId, expenseTransactionId, incomeTransactionId },
  });
}

export async function getDismissalsForUser({
  userId,
  expenseTransactionIds,
}: {
  userId: number;
  expenseTransactionIds?: string[];
}) {
  return TransferSuggestionDismissals.findAll({
    where: {
      userId,
      ...(expenseTransactionIds && { expenseTransactionId: expenseTransactionIds }),
    },
    attributes: ['expenseTransactionId', 'incomeTransactionId'],
    raw: true,
  });
}
