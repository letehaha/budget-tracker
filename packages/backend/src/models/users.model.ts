import { UserModel, USER_ROLES, UserRole } from '@bt/shared/types';
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
  BelongsToMany,
  Default,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';

import Currencies from './currencies.model';
import UsersCurrencies from './users-currencies.model';

const DEFAULT_TOTAL_BALANCE = 0;

@Table({
  timestamps: false,
  tableName: 'Users',
  freezeTableName: true,
  defaultScope: {
    attributes: { exclude: ['password'] },
  },
  scopes: {
    withPassword: {
      attributes: { exclude: [] },
    },
  },
})
export default class Users extends Model<InferAttributes<Users>, InferCreationAttributes<Users>> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.STRING)
  @NotNull
  @Unique
  declare username: string;

  @Attribute(DataTypes.STRING)
  @Unique
  declare email: string | null;

  @Attribute(DataTypes.STRING)
  declare firstName: string | null;

  @Attribute(DataTypes.STRING)
  declare lastName: string | null;

  @Attribute(DataTypes.STRING)
  declare middleName: string | null;

  @Attribute(DataTypes.STRING)
  declare password: string | null;

  @Attribute(DataTypes.STRING)
  declare authUserId: string | null;

  @Attribute(DataTypes.STRING(2000))
  declare avatar: string | null;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(DEFAULT_TOTAL_BALANCE)
  declare totalBalance: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  declare defaultCategoryId: number | null;

  @Attribute(DataTypes.STRING(20))
  @NotNull
  @Default(USER_ROLES.common)
  declare role: CreationOptional<UserRole>;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare createdAt: CreationOptional<Date>;

  @BelongsToMany(() => Currencies, {
    through: () => UsersCurrencies,
    foreignKey: 'userId',
    otherKey: 'currencyCode',
  })
  declare currencies?: NonAttribute<Currencies[]>;
}

export const getUsers = async () => {
  const users = await Users.findAll();

  return users;
};

export const getUserDefaultCategory = async ({ id }: { id: number }): Promise<number> => {
  const user = await Users.findOne({
    where: { id },
    attributes: ['defaultCategoryId'],
  });

  if (!user || user.defaultCategoryId == null) {
    throw new Error(`User with id ${id} not found or has no default category`);
  }

  return user.defaultCategoryId;
};

export const createUser = async ({
  username,
  email,
  firstName,
  lastName,
  middleName,
  password,
  avatar,
  totalBalance = DEFAULT_TOTAL_BALANCE,
  authUserId,
  role = USER_ROLES.common,
}: {
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  password?: string;
  avatar?: string;
  totalBalance?: number;
  authUserId?: string;
  role?: UserRole;
}): Promise<UserModel> => {
  const user = await Users.create({
    username,
    email,
    firstName,
    lastName,
    middleName,
    password,
    avatar,
    totalBalance,
    authUserId,
    role,
  });

  return user as unknown as UserModel;
};

export const getUserByAuthUserId = async ({
  authUserId,
}: {
  authUserId: string;
}): Promise<Pick<UserModel, 'id' | 'username' | 'role'> | null> => {
  const user = await Users.findOne({
    where: { authUserId },
    attributes: ['id', 'username', 'role'],
    raw: true,
  });

  return user;
};

export const updateUserById = async ({
  id,
  username,
  email,
  firstName,
  lastName,
  middleName,
  password,
  avatar,
  totalBalance,
  defaultCategoryId,
}: {
  id: number;
  username?: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  avatar?: string;
  totalBalance?: number;
  defaultCategoryId?: number;
}): Promise<UserModel | null> => {
  const where = { id };
  const updateFields: Record<string, unknown> = {};

  if (username) updateFields.username = username;
  if (email) updateFields.email = email;
  if (firstName) updateFields.firstName = firstName;
  if (lastName) updateFields.lastName = lastName;
  if (middleName) updateFields.middleName = middleName;
  if (avatar) updateFields.avatar = avatar;
  if (password) updateFields.password = password;
  if (totalBalance) updateFields.totalBalance = totalBalance;
  if (defaultCategoryId) updateFields.defaultCategoryId = defaultCategoryId;

  await Users.update(updateFields, {
    where,
  });

  const user = await Users.findOne({
    where,
  });

  return user as unknown as UserModel | null;
};
