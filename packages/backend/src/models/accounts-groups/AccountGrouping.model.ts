import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import { Attribute, AutoIncrement, Index, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';

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
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare accountId: number;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare groupId: number;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // In Sequelize v7, BelongsTo associations are auto-created by BelongsToMany on AccountGroups model
  declare account?: NonAttribute<Accounts>;
  declare group?: NonAttribute<AccountGroup>;
}
