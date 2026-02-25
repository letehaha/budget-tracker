import Budgets from '@models/Budget.model';
import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';

import Transactions from './Transactions.model';

@Table({ tableName: 'BudgetTransactions', timestamps: false })
export default class BudgetTransactions extends Model {
  @ForeignKey(() => Budgets)
  @Column({ primaryKey: true, allowNull: false, type: DataType.INTEGER })
  budgetId!: number;

  @ForeignKey(() => Transactions)
  @Column({ primaryKey: true, allowNull: false, type: DataType.INTEGER })
  transactionId!: number;
}
