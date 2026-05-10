import {
  ResourceType,
  SHARE_INVITATION_STATUSES,
  ShareInvitationModel,
  ShareInvitationStatus,
  SharePermission,
  SharePolicy,
} from '@bt/shared/types';
import { BeforeCreate, BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import Users from './users.model';

@Table({
  tableName: 'ShareInvitations',
  timestamps: true,
  freezeTableName: true,
})
export default class ShareInvitations extends Model implements ShareInvitationModel {
  @Column({
    type: DataType.UUID,
    primaryKey: true,
  })
  declare id: string;

  @BeforeCreate
  static generateUUIDv7(instance: ShareInvitations) {
    if (!instance.id) {
      instance.id = uuidv7();
    }
  }

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  ownerUserId!: number;

  @Column({
    type: DataType.STRING(320),
    allowNull: false,
  })
  inviteeEmail!: string;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  inviteeUserId!: number | null;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
  })
  resourceType!: ResourceType;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  resourceId!: string;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
  })
  permission!: SharePermission;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  policy!: SharePolicy | null;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
    unique: true,
  })
  token!: string;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
    defaultValue: SHARE_INVITATION_STATUSES.pending,
  })
  status!: ShareInvitationStatus;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  expiresAt!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  acceptedAt!: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declinedAt!: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  revokedAt!: Date | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  resendCount!: number;

  /**
   * ISO timestamp strings for resends within the rolling 24h rate-limit window. Pruned to
   * the window on every resend so length is naturally bounded by the limit (Phase 1: 3).
   */
  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  recentResendsAt!: string[];

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Users, 'ownerUserId')
  owner!: Users;

  @BelongsTo(() => Users, 'inviteeUserId')
  invitee!: Users | null;
}
