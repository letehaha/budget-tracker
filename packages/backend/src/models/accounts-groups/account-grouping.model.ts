import { RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';

import Accounts from '../accounts.model';
import AccountGroup from './account-groups.model';

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
  freezeTableName: true,
  indexes: [
    {
      fields: ['accountId', 'groupId'],
      unique: true,
    },
  ],
})
export default class AccountGrouping extends Model {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Accounts)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  accountId!: RecordId;

  @ForeignKey(() => AccountGroup)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  groupId!: RecordId;

  @BelongsTo(() => Accounts)
  account!: Accounts;

  @BelongsTo(() => AccountGroup)
  group!: AccountGroup;
}
