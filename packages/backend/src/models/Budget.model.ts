import { Table, Column, Model, ForeignKey, DataType, BelongsToMany } from 'sequelize-typescript';
import Users from '@models/Users.model';
// import Categories from '@models/Categories.model';
import Transactions from '@models/Transactions.model';
import BudgetTransactions from './BudgetTransactions.model';

@Table({
  timestamps: false,
})
export default class Budgets extends Model {
  @Column({ primaryKey: true, autoIncrement: true, allowNull: false })
  id!: number;

  @Column({ allowNull: false })
  name!: string;

  @Column({ allowNull: false })
  status!: string;

  @Column({ allowNull: true })
  categoryName!: string;

  @Column({ type: DataType.DATE, allowNull: true })
  startDate!: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  endDate!: Date;

  @Column({ defaultValue: false })
  autoInclude!: boolean;

  @Column({ allowNull: true })
  limitAmount!: number;

  @ForeignKey(() => Users)
  @Column({ allowNull: false })
  userId!: number;

  // @ForeignKey(() => Categories)
  // @Column({ allowNull: true })
  // categoriesIds: number;

  @BelongsToMany(() => Transactions, {
    through: { model: () => BudgetTransactions, unique: false },
    foreignKey: 'budgetId',
    otherKey: 'transactionId',
  })
  transactions!: number[];
}
