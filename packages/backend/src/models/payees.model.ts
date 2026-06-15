import { CATEGORIZATION_MODE, PayeeLogoSource, RecordId } from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, BelongsTo, BelongsToMany, HasMany, DataType } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import Categories from './categories.model';
import PayeeAliases from './payee-aliases.model';
import PayeeTags from './payee-tags.model';
import Tags from './tags.model';
import Users from './users.model';

@Table({
  tableName: 'Payees',
  timestamps: true,
  freezeTableName: true,
})
export default class Payees extends Model {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.STRING(200),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.STRING(200),
    allowNull: false,
  })
  normalizedName!: string;

  @ForeignKey(() => Categories)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  defaultCategoryId!: RecordId | null;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: CATEGORIZATION_MODE.enforce,
  })
  categorizationMode!: CATEGORIZATION_MODE;

  @Column({
    type: DataType.STRING(253),
    allowNull: true,
  })
  logoDomain!: string | null;

  // VARCHAR + TS-side union (project convention: no DB enums). 'auto' =
  // system-resolved via BrandLogos; 'manual' = user override.
  @Column({
    type: DataType.STRING(16),
    allowNull: true,
  })
  logoSource!: PayeeLogoSource | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Users)
  user!: Users;

  @BelongsTo(() => Categories)
  defaultCategory?: Categories | null;

  @HasMany(() => PayeeAliases, { foreignKey: 'payeeId', as: 'aliases' })
  aliases?: PayeeAliases[];

  @BelongsToMany(() => Tags, {
    through: () => PayeeTags,
    foreignKey: 'payeeId',
    otherKey: 'tagId',
    as: 'defaultTags',
  })
  defaultTags?: Tags[];
}
