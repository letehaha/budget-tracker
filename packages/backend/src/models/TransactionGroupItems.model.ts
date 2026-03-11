import TransactionGroups from '@models/TransactionGroups.model';
import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';

import Transactions from './Transactions.model';

@Table({ tableName: 'TransactionGroupItems', timestamps: false })
export default class TransactionGroupItems extends Model {
  @ForeignKey(() => TransactionGroups)
  @Column({ primaryKey: true, allowNull: false, type: DataType.INTEGER })
  groupId!: number;

  @ForeignKey(() => Transactions)
  @Column({ primaryKey: true, allowNull: false, type: DataType.INTEGER })
  transactionId!: number;
}
