import { Table, Column, Model, ForeignKey, DataType, BelongsToMany } from 'sequelize-typescript';
import Users from '@models/Users.model';
import Transactions from '@models/Transactions.model';
import TransactionTags from './TransactionTags.model';

@Table({
  tableName: 'Tags',
  timestamps: false,
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

  @Column({ allowNull: false, type: DataType.DATE, defaultValue: DataType.NOW })
  createdAt!: Date;

  @BelongsToMany(() => Transactions, {
    through: { model: () => TransactionTags, unique: false },
    foreignKey: 'tagId',
    otherKey: 'transactionId',
  })
  transactions!: Transactions[];
}
