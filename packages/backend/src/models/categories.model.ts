import { CATEGORY_TYPES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ValidationError } from '@js/errors';
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
  Index,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';

import MerchantCategoryCodes from './merchant-category-codes.model';
import UserMerchantCategoryCodes from './user-merchant-category-codes.model';

@Table({
  timestamps: false,
  tableName: 'Categories',
  freezeTableName: true,
})
export default class Categories extends Model<InferAttributes<Categories>, InferCreationAttributes<Categories>> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  @Unique
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare name: string;

  // Lucide-icons icon name
  @Attribute(DataTypes.STRING(50))
  declare icon: string | null;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare color: string;

  @Attribute(DataTypes.ENUM({ values: Object.values(CATEGORY_TYPES) }))
  @NotNull
  @Default(CATEGORY_TYPES.custom)
  declare type: CreationOptional<CATEGORY_TYPES>;

  @Attribute(DataTypes.INTEGER)
  declare parentId: number | null;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare userId: number;

  @BelongsToMany(() => MerchantCategoryCodes, {
    through: () => UserMerchantCategoryCodes,
    foreignKey: 'categoryId',
    otherKey: 'mccId',
  })
  declare merchantCodes?: NonAttribute<MerchantCategoryCodes[]>;
}

export const getCategories = async ({ userId }: { userId: number }) => {
  const categories = await Categories.findAll({
    where: { userId },
    raw: true,
  });

  return categories;
};

export interface CreateCategoryPayload {
  userId: number;
  name: string;
  icon?: string | null;
  color?: string;
  parentId?: number;
  type?: CATEGORY_TYPES;
}

export const createCategory = async ({ parentId, color, userId, ...params }: CreateCategoryPayload) => {
  if (parentId) {
    const parent = await Categories.findOne({
      where: { id: parentId, userId },
    });

    if (!parent) {
      throw new ValidationError({
        message: "Category with such parentId doesn't exist.",
      });
    }

    if (!color) color = parent.get('color');
  }

  if (!color) {
    throw new ValidationError({ message: 'Color is required when parentId is not provided.' });
  }

  const category = await Categories.create({
    parentId,
    color,
    userId,
    ...params,
  });

  return category;
};

export interface EditCategoryPayload {
  userId: number;
  categoryId: number;
  name?: string;
  icon?: string | null;
  color?: string;
}

export const editCategory = async ({ userId, categoryId, ...params }: EditCategoryPayload) => {
  await findOrThrowNotFound({
    query: Categories.findByPk(categoryId),
    message: 'Category with provided id does not exist!',
  });
  const [, categories] = await Categories.update(params, {
    where: {
      id: categoryId,
      userId,
    },
    returning: true,
  });

  return categories;
};

export interface DeleteCategoryPayload {
  userId: number;
  categoryId: number;
}

export const deleteCategory = async ({ userId, categoryId }: DeleteCategoryPayload) => {
  return Categories.destroy({
    where: { userId, id: categoryId },
  });
};

export const bulkCreate = (
  { data },
  {
    validate = true,
    returning = false,
  }: {
    validate?: boolean;
    returning?: boolean;
  },
) => {
  return Categories.bulkCreate(data, {
    validate,
    returning,
  });
};
