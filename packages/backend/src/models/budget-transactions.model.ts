import type { RecordId } from '@bt/shared/types';
import type { InferAttributes, InferCreationAttributes } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import { Attribute, Index, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

/**
 * Per-row metadata captured at attach-time. Owner-attached rows leave the column
 * `null` entirely; recipient-attached rows carry a populated `BudgetTransactionMetadata`
 * with `addedByUserId` set so the revoke/leave sweep and the detach-permission check
 * can identify rows the recipient is allowed to touch. `addedByUserId` is required
 * (not optional) — a present metadata object without it is meaningless and would be
 * indistinguishable from `null`; the model column carries the recipient/owner
 * discriminator, not the field's optionality. Kept as a JSONB blob (not a typed
 * column) so future attributes can land without another migration.
 */
export interface BudgetTransactionMetadata {
  addedByUserId: number;
}

@Table({ tableName: 'BudgetTransactions', timestamps: false })
export default class BudgetTransactions extends Model<
  InferAttributes<BudgetTransactions>,
  InferCreationAttributes<BudgetTransactions>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  @Index
  declare budgetId: RecordId;

  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  @Index
  declare transactionId: RecordId;

  @Attribute(DataTypes.JSONB)
  declare metadata: BudgetTransactionMetadata | null;
}
