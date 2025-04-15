import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';
import Accounts from '../Accounts.model';
import AccountGroup from './AccountGroups.model';

/**
 * This model represents the many-to-many relationship between Accounts and AccountGroups.
 * It allows an account to belong to multiple groups and a group to contain multiple accounts.
 *
 * Key features:
 * - Links Accounts and AccountGroups
 * - Enables flexible organization of accounts into groups
 */

@Table({
  tableName: 'AccountGroupings',
  timestamps: true,
  indexes: [
    {
      fields: ['accountId', 'groupId'],
      unique: true,
    },
  ],
})
export default class AccountGrouping extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @ForeignKey(() => Accounts)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  accountId!: number;

  @ForeignKey(() => AccountGroup)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  groupId!: number;

  @BelongsTo(() => Accounts)
  account!: Accounts;

  @BelongsTo(() => AccountGroup)
  group!: AccountGroup;
}
