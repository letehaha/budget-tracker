// AccountGroup.model.ts
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import {
  Attribute,
  AutoIncrement,
  BelongsTo,
  BelongsToMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';

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
export default class AccountGroup extends Model<InferAttributes<AccountGroup>, InferCreationAttributes<AccountGroup>> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare name: string;

  @Attribute(DataTypes.INTEGER)
  declare parentGroupId: number | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  // Self-referencing associations cannot use decorators in Sequelize v7
  // They are defined programmatically in models/index.ts after initialization
  declare parentGroup?: NonAttribute<AccountGroup>;
  declare childGroups?: NonAttribute<AccountGroup[]>;

  @BelongsToMany(() => Accounts, {
    through: () => AccountGrouping,
    foreignKey: 'groupId',
    otherKey: 'accountId',
  })
  declare accounts?: NonAttribute<Accounts[]>;
}
