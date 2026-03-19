import TransactionGroups from '@models/transaction-groups.model';
import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';

import Transactions from './transactions.model';

@Table({ tableName: 'TransactionGroupItems', timestamps: false })
export default class TransactionGroupItems extends Model {
  @ForeignKey(() => TransactionGroups)
  @Column({ primaryKey: true, allowNull: false, type: DataType.INTEGER })
  groupId!: number;

  @ForeignKey(() => Transactions)
  @Column({ primaryKey: true, allowNull: false, type: DataType.INTEGER })
  transactionId!: number;
}
