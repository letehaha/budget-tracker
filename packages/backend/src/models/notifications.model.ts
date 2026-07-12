import {
  NotificationModel,
  NotificationPayload,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
  RecordId,
} from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { Table, Column, Model, ForeignKey, BelongsTo, DataType } from 'sequelize-typescript';

import Users from './users.model';

@Table({
  tableName: 'Notifications',
  timestamps: false,
  freezeTableName: true,
})
export default class Notifications extends Model implements NotificationModel {
  @Column(IdColumn())
  declare id: RecordId;

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
  declare createdAt: Date;

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
