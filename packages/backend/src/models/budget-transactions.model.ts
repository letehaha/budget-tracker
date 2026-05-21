import { RecordId } from '@bt/shared/types';
import Budgets from '@models/budget.model';
import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';

import Transactions from './transactions.model';

/**
 * Per-row metadata captured at attach-time. Owner-attached rows leave this `null`.
 * Recipient-attached rows carry `addedByUserId` so the revoke/leave sweep and
 * the detach-permission check can identify rows the recipient is allowed to touch.
 * Kept as a JSONB blob (not a typed column) so future attributes can land without
 * another migration.
 */
export interface BudgetTransactionMetadata {
  addedByUserId?: number;
}

@Table({ tableName: 'BudgetTransactions', timestamps: false })
export default class BudgetTransactions extends Model {
  @ForeignKey(() => Budgets)
  @Column({ primaryKey: true, allowNull: false, type: DataType.UUID })
  budgetId!: RecordId;

  @ForeignKey(() => Transactions)
  @Column({ primaryKey: true, allowNull: false, type: DataType.UUID })
  transactionId!: RecordId;

  @Column({ allowNull: true, type: DataType.JSONB })
  metadata!: BudgetTransactionMetadata | null;
}
