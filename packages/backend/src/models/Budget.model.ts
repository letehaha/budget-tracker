import { Table, Column, Model, ForeignKey, DataType, BelongsToMany } from 'sequelize-typescript';
import Users from '@models/Users.model';
import Transactions from '@models/Transactions.model';
import BudgetTransactions from './BudgetTransactions.model';
import { BUDGET_STATUSES } from '@bt/shared/types';

@Table({
  timestamps: false,
})
export default class Budgets extends Model {
  @Column({ primaryKey: true, autoIncrement: true, allowNull: false, type: DataType.INTEGER })
  id!: number;

  @Column({ allowNull: false, type: DataType.STRING(200) })
  name!: string;

  @Column({ allowNull: false, type: DataType.ENUM({ values: Object.values(BUDGET_STATUSES) }) })
  status!: BUDGET_STATUSES;

  @Column({ allowNull: true, type: DataType.STRING })
  categoryName!: string;

  @Column({ type: DataType.DATE, allowNull: true })
  startDate!: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  endDate!: Date;

  @Column({ defaultValue: false, type: DataType.BOOLEAN })
  autoInclude!: boolean;

  @Column({ allowNull: true, type: DataType.NUMBER })
  limitAmount!: number;

  @ForeignKey(() => Users)
  @Column({ allowNull: false, type: DataType.INTEGER })
  userId!: number;

  @BelongsToMany(() => Transactions, {
    through: { model: () => BudgetTransactions, unique: false },
    foreignKey: 'budgetId',
    otherKey: 'transactionId',
  })
  transactions!: number[];
}
