// AccountGroup.model.ts
import { Table, Column, Model, ForeignKey, BelongsTo, HasMany, BelongsToMany, DataType } from 'sequelize-typescript';

import Accounts from '../Accounts.model';
import Users from '../Users.model';
import AccountGrouping from './AccountGrouping.model';

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
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

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
    type: DataType.INTEGER,
    allowNull: true,
  })
  parentGroupId!: number | null;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => AccountGroup, 'parentGroupId')
  parentGroup!: AccountGroup;

  @HasMany(() => AccountGroup, 'parentGroupId')
  childGroups!: AccountGroup[];

  @BelongsToMany(() => Accounts, () => AccountGrouping)
  accounts!: Accounts[];
}
