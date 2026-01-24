import { CATEGORY_TYPES } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, DataType, BelongsToMany } from 'sequelize-typescript';
import Users from './Users.model';
import UserMerchantCategoryCodes from './UserMerchantCategoryCodes.model';
import MerchantCategoryCodes from './MerchantCategoryCodes.model';
import { NotFoundError, ValidationError } from '@js/errors';

@Table({
  timestamps: false,
  tableName: 'Categories',
  freezeTableName: true
})
export default class Categories extends Model {
  @Column({
    unique: true,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @Column({ allowNull: false, type: DataType.STRING })
  name!: string;

  // Lucide-icons icon name
  @Column({ allowNull: true, type: DataType.STRING(50) })
  icon!: string | null;

  @Column({ allowNull: false, type: DataType.STRING })
  color!: string;

  @Column({
    allowNull: false,
    defaultValue: CATEGORY_TYPES.custom,
    type: DataType.ENUM({ values: Object.values(CATEGORY_TYPES) }),
  })
  type!: CATEGORY_TYPES;

  @Column({ allowNull: true, type: DataType.INTEGER })
  parentId!: number;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER })
  userId!: number;

  @BelongsToMany(() => MerchantCategoryCodes, {
    as: 'merchantCodes',
    through: () => UserMerchantCategoryCodes,
  })
  categoryId!: number;
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
  name?: string;
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
  const existingCategory = await Categories.findByPk(categoryId);
  if (!existingCategory) {
    throw new NotFoundError({
      message: 'Category with provided id does not exist!',
    });
  }
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
