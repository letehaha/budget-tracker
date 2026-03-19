import Tags from '@models/tags.model';
import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';

import Transactions from './transactions.model';

@Table({ tableName: 'TransactionTags', timestamps: false })
export default class TransactionTags extends Model {
  @ForeignKey(() => Tags)
  @Column({ primaryKey: true, allowNull: false, type: DataType.INTEGER })
  tagId!: number;

  @ForeignKey(() => Transactions)
  @Column({ primaryKey: true, allowNull: false, type: DataType.INTEGER })
  transactionId!: number;
}
