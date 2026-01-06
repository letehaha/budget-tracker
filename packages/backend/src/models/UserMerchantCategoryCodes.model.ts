import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from '@sequelize/core';
import { Attribute, AutoIncrement, Index, NotNull, PrimaryKey, Table, Unique } from '@sequelize/core/decorators-legacy';

import Categories from './Categories.model';
import MerchantCategoryCodes from './MerchantCategoryCodes.model';
import Users from './Users.model';

@Table({
  timestamps: false,
  tableName: 'UserMerchantCategoryCodes',
  freezeTableName: true,
})
export default class UserMerchantCategoryCodes extends Model<
  InferAttributes<UserMerchantCategoryCodes>,
  InferCreationAttributes<UserMerchantCategoryCodes>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  @Unique
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare categoryId: number;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare mccId: number;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;
}

export const getByPassedParams = async ({
  mccId,
  userId,
  categoryId,
}: {
  mccId?: number;
  userId?: number;
  categoryId?: number;
}) => {
  const where: Record<string, number> = {};

  if (mccId) where.mccId = mccId;
  if (userId) where.userId = userId;
  if (categoryId) where.categoryId = categoryId;

  const mcc = await UserMerchantCategoryCodes.findAll({
    where,
  });

  return mcc;
};

export const createEntry = async ({
  mccId,
  userId,
  categoryId,
}: {
  mccId: number;
  userId: number;
  categoryId: number;
}) => {
  const userMcc = await UserMerchantCategoryCodes.create({
    mccId,
    userId,
    categoryId,
  });

  return userMcc;
};
