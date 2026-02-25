import {
  NotificationModel,
  NotificationPayload,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
} from '@bt/shared/types';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType, BeforeCreate } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import Users from './Users.model';

@Table({
  tableName: 'Notifications',
  timestamps: false,
  freezeTableName: true,
})
export default class Notifications extends Model implements NotificationModel {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
  })
  declare id: string;

  @BeforeCreate
  static generateUUIDv7(instance: Notifications) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  type!: NotificationType;

  @Column({
    type: DataType.STRING(200),
    allowNull: false,
  })
  title!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  message!: string | null;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  payload!: NotificationPayload;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: NOTIFICATION_STATUSES.unread,
  })
  status!: NotificationStatus;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: NOTIFICATION_PRIORITIES.normal,
  })
  priority!: NotificationPriority;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  createdAt!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  readAt!: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  expiresAt!: Date | null;

  @BelongsTo(() => Users)
  user!: Users;
}
