import { RecordId } from '@bt/shared/types';
import TransactionGroups from '@models/transaction-groups.model';
import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';

import Transactions from './transactions.model';

@Table({ tableName: 'TransactionGroupItems', timestamps: false })
export default class TransactionGroupItems extends Model {
  @ForeignKey(() => TransactionGroups)
  @Column({ primaryKey: true, allowNull: false, type: DataType.UUID })
  groupId!: RecordId;

  @ForeignKey(() => Transactions)
  @Column({ primaryKey: true, allowNull: false, type: DataType.UUID })
  transactionId!: RecordId;
}
