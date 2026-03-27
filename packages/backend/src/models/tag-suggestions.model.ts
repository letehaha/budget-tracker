import { TAG_SUGGESTION_SOURCE } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, DataType, BelongsTo } from 'sequelize-typescript';

import TagAutoMatchRules from './tag-auto-match-rules.model';
import Tags from './tags.model';
import Transactions from './transactions.model';
import Users from './users.model';

@Table({
  tableName: 'TagSuggestions',
  freezeTableName: true,
  timestamps: false,
})
export default class TagSuggestions extends Model {
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

  @ForeignKey(() => TagAutoMatchRules)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  ruleId!: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(TAG_SUGGESTION_SOURCE)),
    allowNull: false,
  })
  source!: TAG_SUGGESTION_SOURCE;

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

  @BelongsTo(() => TagAutoMatchRules)
  rule!: TagAutoMatchRules;
}
