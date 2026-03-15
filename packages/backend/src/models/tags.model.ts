import Transactions from '@models/transactions.model';
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
  HasMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';

import TagReminders from './tag-reminders.model';
import TransactionTags from './transaction-tags.model';

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

  @BelongsToMany(() => Transactions, {
    through: () => TransactionTags,
    foreignKey: 'tagId',
    otherKey: 'transactionId',
  })
  declare transactions?: NonAttribute<Transactions[]>;

  @HasMany(() => TagReminders, 'tagId')
  declare reminders?: NonAttribute<TagReminders[]>;
}
