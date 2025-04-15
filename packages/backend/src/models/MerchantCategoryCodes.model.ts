import { Table, Column, Model, Length, BelongsToMany } from 'sequelize-typescript';

import UserMerchantCategoryCodes from './UserMerchantCategoryCodes.model';
import Categories from './Categories.model';

@Table({
  timestamps: false,
})
export default class MerchantCategoryCodes extends Model {
  @Column({
    unique: true,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
  })
  declare id: number;

  @Column({ allowNull: false })
  code!: number;

  @Column({ allowNull: false })
  name!: string;

  @Length({ max: 1000 })
  @Column({ allowNull: true })
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
