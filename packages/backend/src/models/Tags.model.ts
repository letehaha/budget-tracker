import { Table, Column, Model, ForeignKey, DataType, BelongsToMany, HasMany } from 'sequelize-typescript';
import Users from '@models/Users.model';
import Transactions from '@models/Transactions.model';
import TransactionTags from './TransactionTags.model';
import TagReminders from './TagReminders.model';

@Table({
  tableName: 'Tags',
  timestamps: true,
})
export default class Tags extends Model {
  @Column({ primaryKey: true, autoIncrement: true, allowNull: false, type: DataType.INTEGER })
  id!: number;

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
