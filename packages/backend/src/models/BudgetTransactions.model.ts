
import { Table, Column, Model, ForeignKey } from 'sequelize-typescript';
import Budgets from '@models/Budget.model';
import Transactions from './Transactions.model';

@Table({ tableName: 'BudgetTransactions', timestamps: false })

export default class BudgetTransactions extends Model {
  @ForeignKey(() => Budgets)
  @Column({ primaryKey: true, allowNull: false })
  budgetId!: number;

  @ForeignKey(() => Transactions)
  @Column({ primaryKey: true, allowNull: false })
  transactionId!: number;
}
