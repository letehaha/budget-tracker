import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from '@sequelize/core';
import { Attribute, AutoIncrement, NotNull, PrimaryKey, Table, Unique } from '@sequelize/core/decorators-legacy';

import Categories from './Categories.model';

@Table({
  timestamps: false,
  tableName: 'MerchantCategoryCodes',
  freezeTableName: true,
})
export default class MerchantCategoryCodes extends Model<
  InferAttributes<MerchantCategoryCodes>,
  InferCreationAttributes<MerchantCategoryCodes>
> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  @Unique
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare code: string;

  @Attribute(DataTypes.STRING)
  @NotNull
  declare name: string;

  @Attribute(DataTypes.STRING(1000))
  declare description: string | null;

  // In Sequelize v7, BelongsToMany is defined on Categories model and automatically creates the inverse
  declare categories?: NonAttribute<Categories[]>;
}

export const getByCode = async ({ code }: { code: string }) => {
  const mcc = await MerchantCategoryCodes.findOne({
    where: { code },
  });

  return mcc;
};

export const addCode = async ({
  code,
  name = 'Unknown',
  description,
}: {
  code: MerchantCategoryCodes['code'];
  name?: MerchantCategoryCodes['name'];
  description?: MerchantCategoryCodes['description'];
}) => {
  const mcc = await MerchantCategoryCodes.create({
    code,
    name,
    description,
  });

  return mcc;
};
