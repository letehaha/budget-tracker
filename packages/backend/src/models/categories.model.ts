import type { RecordId } from '@bt/shared/types';
import { CATEGORY_TYPES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ValidationError } from '@js/errors';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import {
  Attribute,
  BeforeCreate,
  BelongsToMany,
  Default,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import MerchantCategoryCodes from './merchant-category-codes.model';
import UserMerchantCategoryCodes from './user-merchant-category-codes.model';

@Table({
  timestamps: false,
  tableName: 'Categories',
  freezeTableName: true,
})
export default class Categories extends Model<InferAttributes<Categories>, InferCreationAttributes<Categories>> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare id: CreationOptional<RecordId>;

  @BeforeCreate
  static assignId(instance: Categories) {
    if (!instance.id) instance.id = uuidv7() as RecordId;
  }

  @Attribute(DataTypes.STRING)
  @NotNull
  declare name: string;

  /**
   * Stable, locale-independent identifier for seeded default categories (kebab-case).
   * Null for user-created custom categories. Survives renames and locale changes — used
   * by stats/sharing features to merge equivalent categories across users. The canonical
   * set of values lives in `default-categories.ts`.
   */
  @Attribute(DataTypes.STRING(100))
  declare key: string | null;

  // Lucide-icons icon name
  @Attribute(DataTypes.STRING(50))
  declare icon: string | null;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare color: string;

  @Attribute(DataTypes.STRING)
  @NotNull
  @Default(CATEGORY_TYPES.custom)
  declare type: CreationOptional<CATEGORY_TYPES>;

  @Attribute(DataTypes.UUID)
  declare parentId: RecordId | null;

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

export const getCategoriesForUsers = async ({ userIds }: { userIds: number[] }) => {
  if (userIds.length === 0) return [];
  const categories = await Categories.findAll({
    where: { userId: userIds },
    raw: true,
  });

  return categories;
};

export interface CreateCategoryPayload {
  userId: number;
  name: string;
  icon?: string | null;
  color?: string;
  parentId?: RecordId;
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
  categoryId: string;
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
  categoryId: string;
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
