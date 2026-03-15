import {
  NotificationModel,
  NotificationPayload,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
} from '@bt/shared/types';
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
  BeforeCreate,
  BelongsTo,
  Default,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import Users from './users.model';

@Table({
  tableName: 'Notifications',
  timestamps: false,
  freezeTableName: true,
})
export default class Notifications
  extends Model<InferAttributes<Notifications>, InferCreationAttributes<Notifications>>
  implements NotificationModel
{
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  declare id: CreationOptional<string>;

  @BeforeCreate
  static generateUUIDv7(instance: Notifications) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare userId: number;

  @Attribute(DataTypes.STRING(50))
  @NotNull
  declare type: NotificationType;

  @Attribute(DataTypes.STRING(200))
  @NotNull
  declare title: string;

  @Attribute(DataTypes.TEXT)
  declare message: string | null;

  @Attribute(DataTypes.JSONB)
  @NotNull
  @Default({})
  declare payload: CreationOptional<NotificationPayload>;

  @Attribute(DataTypes.STRING(20))
  @NotNull
  @Default(NOTIFICATION_STATUSES.unread)
  declare status: CreationOptional<NotificationStatus>;

  @Attribute(DataTypes.STRING(20))
  @NotNull
  @Default(NOTIFICATION_PRIORITIES.normal)
  declare priority: CreationOptional<NotificationPriority>;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare createdAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  declare readAt: Date | null;

  @Attribute(DataTypes.DATE)
  declare expiresAt: Date | null;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;
}
