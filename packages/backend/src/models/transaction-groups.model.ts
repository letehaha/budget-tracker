import { RecordId } from '@bt/shared/types';
import Transactions from '@models/transactions.model';
import Users from '@models/users.model';
import { Table, Column, Model, ForeignKey, DataType, BelongsToMany } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import TransactionGroupItems from './transaction-group-items.model';

@Table({
  tableName: 'TransactionGroups',
  timestamps: true,
})
export default class TransactionGroups extends Model {
  @Column({ primaryKey: true, allowNull: false, type: DataType.UUID, defaultValue: () => uuidv7() })
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({ allowNull: false, type: DataType.INTEGER })
  userId!: number;

  @Column({ allowNull: false, type: DataType.STRING(100) })
  name!: string;

  @Column({ allowNull: true, type: DataType.STRING(500) })
  note!: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsToMany(() => Transactions, {
    through: { model: () => TransactionGroupItems, unique: false },
    foreignKey: 'groupId',
    otherKey: 'transactionId',
  })
  transactions!: Transactions[];
}
