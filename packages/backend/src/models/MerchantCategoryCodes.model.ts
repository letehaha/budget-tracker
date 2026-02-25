import { Table, Column, Model, Length, BelongsToMany, DataType } from 'sequelize-typescript';

import Categories from './Categories.model';
import UserMerchantCategoryCodes from './UserMerchantCategoryCodes.model';

@Table({
  timestamps: false,
  tableName: 'MerchantCategoryCodes',
  freezeTableName: true,
})
export default class MerchantCategoryCodes extends Model {
  @Column({
    unique: true,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @Column({ allowNull: false, type: DataType.STRING })
  code!: number;

  @Column({ allowNull: false, type: DataType.STRING })
  name!: string;

  @Length({ max: 1000 })
  @Column({ allowNull: true, type: DataType.STRING })
  description!: string;

  @BelongsToMany(() => Categories, {
    as: 'categories',
    through: () => UserMerchantCategoryCodes,
  })
  mccId!: number;
}

export const getByCode = async ({ code }) => {
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
