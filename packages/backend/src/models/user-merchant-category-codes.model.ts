import { RecordId } from '@bt/shared/types';
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from '@sequelize/core';
import { Attribute, BeforeCreate, Index, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

@Table({
  timestamps: false,
  tableName: 'UserMerchantCategoryCodes',
  freezeTableName: true,
})
export default class UserMerchantCategoryCodes extends Model<
  InferAttributes<UserMerchantCategoryCodes>,
  InferCreationAttributes<UserMerchantCategoryCodes>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare id: CreationOptional<RecordId>;

  @BeforeCreate
  static generateUUIDv7(instance: UserMerchantCategoryCodes) {
    if (!instance.id) {
      instance.id = uuidv7() as RecordId;
    }
  }

  @Attribute(DataTypes.UUID)
  @NotNull
  @Index
  declare categoryId: RecordId;

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
