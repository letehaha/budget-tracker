import {
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_TYPES,
  SubscriptionMatchingRules,
  RemindBeforePreset,
  LogoResolutionState,
  RecordId,
} from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, BelongsTo, BelongsToMany, HasMany, DataType } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import Accounts from './accounts.model';
import Categories from './categories.model';
import SubscriptionPeriods from './subscription-periods.model';
import SubscriptionTransactions from './subscription-transactions.model';
import Transactions from './transactions.model';
import Users from './users.model';

@Table({
  tableName: 'Subscriptions',
  timestamps: true,
  freezeTableName: true,
})
export default class Subscriptions extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.STRING(200),
    allowNull: false,
  })
  name!: string;

  // VARCHAR + TS-side enum (project convention: no DB enums). One of
  // SUBSCRIPTION_TYPES: 'subscription' | 'bill' | 'installment'.
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: SUBSCRIPTION_TYPES.subscription,
  })
  type!: SUBSCRIPTION_TYPES;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  expectedAmount!: number | null;

  @Column({
    type: DataType.STRING(3),
    allowNull: true,
  })
  expectedCurrencyCode!: string | null;

  @Column({
    type: DataType.ENUM(...Object.values(SUBSCRIPTION_FREQUENCIES)),
    allowNull: false,
  })
  frequency!: SUBSCRIPTION_FREQUENCIES;

  @Column({
    type: DataType.DATEONLY,
    allowNull: false,
  })
  startDate!: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  endDate!: string | null;

  @ForeignKey(() => Accounts)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  accountId!: RecordId | null;

  @ForeignKey(() => Categories)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  categoryId!: RecordId | null;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: { rules: [] },
  })
  matchingRules!: SubscriptionMatchingRules;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  isActive!: boolean;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  notes!: string | null;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  dueDate!: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  anchorDay!: number | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  maxOccurrences!: number | null;

  // Set when an installment consumes its full schedule (paid/skipped all
  // maxOccurrences periods); the engine deactivates it at the same time. Null
  // for open installments and for subscriptions/bills. Lets a finished
  // installment be told apart from a manually paused one (both isActive=false).
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  completedAt!: Date | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  showInWidget!: boolean;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  remindBefore!: RemindBeforePreset[];

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  notifyEmail!: boolean;

  @Column({
    type: DataType.STRING(253),
    allowNull: true,
  })
  logoDomain!: string | null;

  // VARCHAR + TS-side union (project convention: no DB enums). 'auto' =
  // system-resolved via BrandLogos; 'manual' = user override; null = unresolved.
  @Column({
    type: DataType.STRING(16),
    allowNull: true,
  })
  logoSource!: LogoResolutionState;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => Accounts)
  account!: Accounts;

  @BelongsTo(() => Categories)
  category!: Categories;

  @BelongsToMany(() => Transactions, {
    through: { model: () => SubscriptionTransactions, unique: false },
    foreignKey: 'subscriptionId',
    otherKey: 'transactionId',
  })
  transactions!: Transactions[];

  @HasMany(() => SubscriptionPeriods, { foreignKey: 'subscriptionId' })
  periods!: SubscriptionPeriods[];
}
