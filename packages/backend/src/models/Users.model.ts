import { UserModel } from '@bt/shared/types';
import { Table, Column, Model, DefaultScope, Scopes, BelongsToMany, Length, DataType } from 'sequelize-typescript';

import UsersCurrencies from './UsersCurrencies.model';
import Currencies from './Currencies.model';

const DETAULT_TOTAL_BALANCE = 0;

@DefaultScope(() => ({
  attributes: { exclude: ['password'] },
}))
@Scopes(() => ({
  withPassword: {
    attributes: { exclude: [] },
  },
}))
@Table({
  timestamps: false,
})
export default class Users extends Model {
  @BelongsToMany(() => Currencies, {
    as: 'currencies',
    through: () => UsersCurrencies,
  })
  @Column({
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    unique: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @Column({
    unique: true,
    allowNull: false,
    type: DataType.STRING,
  })
  username!: string;

  @Column({
    unique: true,
    allowNull: true,
    type: DataType.STRING,
  })
  email!: string;

  @Column({ allowNull: true, type: DataType.STRING, })
  firstName!: string;

  @Column({ allowNull: true, type: DataType.STRING, })
  lastName!: string;

  @Column({ allowNull: true, type: DataType.STRING, })
  middleName!: string;

  @Column({ allowNull: false, type: DataType.STRING, })
  password!: string;

  @Length({ max: 2000 })
  @Column({ allowNull: true, type: DataType.STRING, })
  avatar!: string;

  @Column({
    defaultValue: DETAULT_TOTAL_BALANCE,
    allowNull: false,
    type: DataType.NUMBER,
  })
  totalBalance!: number;

  @Column({ allowNull: true, type: DataType.NUMBER, })
  defaultCategoryId!: number;
}

export const getUsers = async () => {
  const users = await Users.findAll();

  return users;
};

export const getUserById = async ({ id }: { id: number }): Promise<UserModel | null> => {
  const user = await Users.findOne({
    where: { id },
  });

  return user;
};

export const getUserDefaultCategory = async ({ id }: { id: number }) => {
  const user = await Users.findOne({
    where: { id },
    attributes: ['defaultCategoryId'],
  });

  return user;
};

export const getUserCurrencies = async ({ userId }: { userId: number }) => {
  const user = await Users.findOne({
    where: { id: userId },
    include: [
      {
        model: Currencies,
        as: 'currencies',
        // to remove the rows from the join table (i.e. 'UsersCurrencies' table) in the result set
        through: { attributes: [] },
      },
    ],
  });

  return user;
};

export const getUserByCredentials = async ({
  username,
  email,
}: {
  username?: string;
  email?: string;
}): Promise<UserModel | null> => {
  const where: Record<string, unknown> = {};

  if (username) where.username = username;
  if (email) where.email = email;

  const user = await Users.scope('withPassword').findOne({
    where,
  });

  return user;
};

export const createUser = async ({
  username,
  email,
  firstName,
  lastName,
  middleName,
  password,
  avatar,
  totalBalance = DETAULT_TOTAL_BALANCE,
}: {
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  password: string;
  avatar?: string;
  totalBalance?: number;
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

  return user;
};
