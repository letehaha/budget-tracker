import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';

import Categories from './Categories.model';
import Users from './Users.model';
import MerchantCategoryCodes from './MerchantCategoryCodes.model';

@Table({
  timestamps: false,
  tableName: 'UserMerchantCategoryCodes',
  freezeTableName: true,
})
export default class UserMerchantCategoryCodes extends Model {
  @Column({
    unique: true,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @ForeignKey(() => Categories)
  @Column({ allowNull: false, type: DataType.INTEGER })
  categoryId!: number;

  @ForeignKey(() => MerchantCategoryCodes)
  @Column({ allowNull: false, type: DataType.INTEGER })
  mccId!: number;

  @ForeignKey(() => Users)
  @Column({ allowNull: false, type: DataType.INTEGER })
  userId!: number;
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

export const createEntry = async ({ mccId, userId, categoryId }) => {
  const userMcc = await UserMerchantCategoryCodes.create({
    mccId,
    userId,
    categoryId,
  });

  return userMcc;
};
