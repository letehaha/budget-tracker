import type { RecordId } from '@bt/shared/types';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import { Attribute, Default, Index, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import type Accounts from '../accounts.model';
import type AccountGroup from './account-groups.model';

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
export default class AccountGrouping extends Model<
  InferAttributes<AccountGrouping>,
  InferCreationAttributes<AccountGrouping>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @Default(() => uuidv7())
  declare id: CreationOptional<RecordId>;

  @Attribute(DataTypes.UUID)
  @NotNull
  @Index
  declare accountId: RecordId;

  @Attribute(DataTypes.UUID)
  @NotNull
  @Index
  declare groupId: RecordId;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // In Sequelize v7, BelongsTo associations are auto-created by BelongsToMany on AccountGroups model
  declare account?: NonAttribute<Accounts>;
  declare group?: NonAttribute<AccountGroup>;
}
