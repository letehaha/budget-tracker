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
  HasMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';

import TagReminders from './tag-reminders.model';
import type Transactions from './transactions.model';
@Table({
  tableName: 'Tags',
  timestamps: true,
})
export default class Tags extends Model<InferAttributes<Tags>, InferCreationAttributes<Tags>> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.STRING(100))
  @NotNull
  declare name: string;

  @Attribute(DataTypes.STRING(7))
  @NotNull
  declare color: string;

  @Attribute(DataTypes.STRING(50))
  declare icon: string | null;

  @Attribute(DataTypes.TEXT)
  declare description: string | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Inverse of Transactions.@BelongsToMany(Tags) — auto-created by Sequelize v7
  declare transactions?: NonAttribute<Transactions[]>;

  @HasMany(() => TagReminders, 'tagId')
  declare reminders?: NonAttribute<TagReminders[]>;
}
