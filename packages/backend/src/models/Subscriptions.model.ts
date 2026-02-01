import {
  SUBSCRIPTION_FREQUENCIES,
  SUBSCRIPTION_TYPES,
  SubscriptionMatchingRules,
} from '@bt/shared/types';
import {
  Table,
  Column,
  Model,
  ForeignKey,
  BelongsTo,
  BelongsToMany,
  DataType,
  BeforeCreate,
} from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';
import Accounts from './Accounts.model';
import Categories from './Categories.model';
import SubscriptionTransactions from './SubscriptionTransactions.model';
import Transactions from './Transactions.model';
import Users from './Users.model';

@Table({
  tableName: 'Subscriptions',
  timestamps: true,
  freezeTableName: true,
})
export default class Subscriptions extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
  })
  declare id: string;

  @BeforeCreate
  static generateUUIDv7(instance: Subscriptions) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

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

  @Column({
    type: DataType.ENUM(...Object.values(SUBSCRIPTION_TYPES)),
    allowNull: false,
    defaultValue: SUBSCRIPTION_TYPES.subscription,
  })
  type!: SUBSCRIPTION_TYPES;

  @Column({
    type: DataType.INTEGER,
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
    type: DataType.INTEGER,
    allowNull: true,
  })
  accountId!: number | null;

  @ForeignKey(() => Categories)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  categoryId!: number | null;

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
}
