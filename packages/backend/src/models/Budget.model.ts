import { Table, Column, Model, ForeignKey, DataType, BelongsToMany } from 'sequelize-typescript';
import Users from '@models/Users.model';
import Transactions from '@models/Transactions.model';
import BudgetTransactions from './BudgetTransactions.model';
import { BUDGET_STATUSES } from '@bt/shared/types';

@Table({
  timestamps: false,
})
export default class Budgets extends Model {
  @Column({ primaryKey: true, autoIncrement: true, allowNull: false })
  id!: number;

  @Column({ allowNull: false })
  name!: string;

  @Column({ allowNull: false })
  status!: BUDGET_STATUSES;

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

  @BelongsToMany(() => Transactions, {
    through: { model: () => BudgetTransactions, unique: false },
    foreignKey: 'budgetId',
    otherKey: 'transactionId',
  })
  transactions!: number[];
}
