import { TagReminderFrequency, TagReminderSettings, TagReminderType } from '@bt/shared/types';
import Tags from '@models/tags.model';
import Users from '@models/users.model';
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
  BelongsTo,
  Default,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';

@Table({
  tableName: 'TagReminders',
  timestamps: true,
})
export default class TagReminders extends Model<InferAttributes<TagReminders>, InferCreationAttributes<TagReminders>> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare tagId: number;

  @Attribute(DataTypes.STRING(20))
  @NotNull
  declare type: TagReminderType;

  /** Frequency preset. Null means real-time trigger (immediate when tagged) */
  @Attribute(DataTypes.STRING(15))
  declare frequency: TagReminderFrequency | null;

  /** Day of month to check (1-31). Only for monthly/quarterly/yearly. Null = 1st */
  @Attribute(DataTypes.SMALLINT)
  declare dayOfMonth: number | null;

  /** Type-specific settings (e.g., amountThreshold for amount_threshold type) */
  @Attribute(DataTypes.JSONB)
  @NotNull
  @Default({})
  declare settings: CreationOptional<TagReminderSettings>;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(true)
  declare isEnabled: CreationOptional<boolean>;

  @Attribute(DataTypes.DATE)
  declare lastCheckedAt: Date | null;

  @Attribute(DataTypes.DATE)
  declare lastTriggeredAt: Date | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Tags, 'tagId')
  declare tag?: NonAttribute<Tags>;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;
}
