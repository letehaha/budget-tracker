import type {
  ResourceType,
  RecordId,
  ShareInvitationModel,
  ShareInvitationStatus,
  SharePermission,
  SharePolicy,
} from '@bt/shared/types';
import { SHARE_INVITATION_STATUSES } from '@bt/shared/types';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import {
  Attribute,
  BeforeCreate,
  BelongsTo,
  Default,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import Users from './users.model';

@Table({
  tableName: 'ShareInvitations',
  timestamps: true,
  freezeTableName: true,
})
export default class ShareInvitations
  extends Model<InferAttributes<ShareInvitations>, InferCreationAttributes<ShareInvitations>>
  implements ShareInvitationModel
{
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare id: CreationOptional<RecordId>;

  @BeforeCreate
  static generateUUIDv7(instance: ShareInvitations) {
    if (!instance.id) {
      instance.id = uuidv7() as RecordId;
    }
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare ownerUserId: number;

  @Attribute(DataTypes.STRING(320))
  @NotNull
  declare inviteeEmail: string;

  @Attribute(DataTypes.INTEGER)
  declare inviteeUserId: number | null;

  @Attribute(DataTypes.STRING(32))
  @NotNull
  declare resourceType: ResourceType;

  @Attribute(DataTypes.STRING(255))
  @NotNull
  declare resourceId: string;

  @Attribute(DataTypes.STRING(32))
  @NotNull
  declare permission: SharePermission;

  @Attribute(DataTypes.JSONB)
  declare policy: SharePolicy | null;

  @Attribute(DataTypes.STRING(64))
  @NotNull
  @Unique
  declare token: string;

  @Attribute(DataTypes.STRING(32))
  @NotNull
  @Default(SHARE_INVITATION_STATUSES.pending)
  declare status: CreationOptional<ShareInvitationStatus>;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare expiresAt: Date;

  @Attribute(DataTypes.DATE)
  declare acceptedAt: Date | null;

  @Attribute(DataTypes.DATE)
  declare declinedAt: Date | null;

  @Attribute(DataTypes.DATE)
  declare revokedAt: Date | null;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare resendCount: CreationOptional<number>;

  /**
   * ISO timestamp strings for resends within the rolling 24h rate-limit window. Pruned to
   * the window on every resend so length is naturally bounded by the limit (Phase 1: 3).
   */
  @Attribute(DataTypes.JSONB)
  @NotNull
  @Default([])
  declare recentResendsAt: CreationOptional<string[]>;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare createdAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Users, 'ownerUserId')
  declare owner?: NonAttribute<Users>;

  @BelongsTo(() => Users, 'inviteeUserId')
  declare invitee?: NonAttribute<Users | null>;
}
