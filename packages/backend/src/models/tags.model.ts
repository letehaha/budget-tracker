import { RecordId } from '@bt/shared/types';
import Transactions from '@models/transactions.model';
import Users from '@models/users.model';
import { Table, Column, Model, ForeignKey, DataType, BelongsToMany, HasMany } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import TagReminders from './tag-reminders.model';
import TransactionTags from './transaction-tags.model';

@Table({
  tableName: 'Tags',
  timestamps: true,
})
export default class Tags extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: () => uuidv7() })
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({ allowNull: false, type: DataType.INTEGER })
  userId!: number;

  @Column({ allowNull: false, type: DataType.STRING(100) })
  name!: string;

  @Column({ allowNull: false, type: DataType.STRING(7) })
  color!: string;

  @Column({ allowNull: true, type: DataType.STRING(50) })
  icon!: string | null;

  @Column({ allowNull: true, type: DataType.TEXT })
  description!: string | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsToMany(() => Transactions, {
    through: { model: () => TransactionTags, unique: false },
    foreignKey: 'tagId',
    otherKey: 'transactionId',
  })
  transactions!: Transactions[];

  @HasMany(() => TagReminders, { foreignKey: 'tagId' })
  reminders!: TagReminders[];
}
