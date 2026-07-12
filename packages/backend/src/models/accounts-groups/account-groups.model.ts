import { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Table, Column, Model, ForeignKey, BelongsTo, HasMany, BelongsToMany, DataType } from 'sequelize-typescript';
// AccountGroup.model.ts

import Accounts from '../accounts.model';
import BankDataProviderConnections from '../bank-data-provider-connections.model';
import Users from '../users.model';
import AccountGrouping from './account-grouping.model';

/**
 * This model represents a group of accounts. It allows users to organize their accounts
 * into hierarchical groups (folders). Each group belongs to a user and can have
 * a parent group, enabling multi-level organization.
 *
 * Key features:
 * - Belongs to a user
 * - Can have a parent group (for nested groups)
 * - Can have multiple child groups
 * - Associated with multiple accounts through AccountGrouping
 */

@Table({
  tableName: 'AccountGroups',
  timestamps: true,
  freezeTableName: true,
})
export default class AccountGroup extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name!: string;

  @ForeignKey(() => AccountGroup)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  parentGroupId!: RecordId | null;

  @ForeignKey(() => BankDataProviderConnections)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  bankDataProviderConnectionId!: RecordId | null;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => BankDataProviderConnections)
  bankDataProviderConnection!: BankDataProviderConnections;

  @BelongsTo(() => AccountGroup, 'parentGroupId')
  parentGroup!: AccountGroup;

  @HasMany(() => AccountGroup, 'parentGroupId')
  childGroups!: AccountGroup[];

  @BelongsToMany(() => Accounts, () => AccountGrouping)
  accounts!: Accounts[];
}
