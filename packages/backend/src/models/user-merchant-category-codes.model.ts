import { RecordId } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, DataType } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import Categories from './categories.model';
import MerchantCategoryCodes from './merchant-category-codes.model';
import Users from './users.model';

@Table({
  timestamps: false,
  tableName: 'UserMerchantCategoryCodes',
  freezeTableName: true,
})
export default class UserMerchantCategoryCodes extends Model {
  @Column({
    allowNull: false,
    primaryKey: true,
    type: DataType.UUID,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  @ForeignKey(() => Categories)
  @Column({ allowNull: false, type: DataType.UUID })
  categoryId!: RecordId;

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
  categoryId?: string;
}) => {
  const where: Record<string, number | string> = {};

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
