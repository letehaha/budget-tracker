import type { TagReminderFrequency, TagReminderSettings, TagReminderType } from '@bt/shared/types';
import type { RecordId } from '@bt/shared/types';
import Tags from '@models/tags.model';
import Users from '@models/users.model';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import {
  Attribute,
  BeforeCreate,
  BelongsTo,
  Default,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

@Table({
  tableName: 'TagReminders',
  timestamps: true,
})
export default class TagReminders extends Model<InferAttributes<TagReminders>, InferCreationAttributes<TagReminders>> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  declare id: CreationOptional<string>;

  @BeforeCreate
  static generateUUIDv7(instance: TagReminders) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.UUID)
  @NotNull
  @Index
  declare tagId: RecordId;

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
