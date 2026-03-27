import { Table, Column, Model, ForeignKey, DataType, BelongsTo } from 'sequelize-typescript';

import Tags from './tags.model';
import Transactions from './transactions.model';
import Users from './users.model';

@Table({
  tableName: 'TagSuggestionDismissals',
  freezeTableName: true,
  timestamps: false,
})
export default class TagSuggestionDismissals extends Model {
  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    primaryKey: true,
  })
  userId!: number;

  @ForeignKey(() => Transactions)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    primaryKey: true,
  })
  transactionId!: number;

  @ForeignKey(() => Tags)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    primaryKey: true,
  })
  tagId!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => Transactions)
  transaction!: Transactions;

  @BelongsTo(() => Tags)
  tag!: Tags;
}
