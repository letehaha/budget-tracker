import type { ResourceShareModel, ResourceType, SharePermission, SharePolicy, RecordId } from '@bt/shared/types';
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
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import Users from './users.model';

@Table({
  tableName: 'ResourceShares',
  timestamps: true,
  freezeTableName: true,
})
export default class ResourceShares
  extends Model<InferAttributes<ResourceShares>, InferCreationAttributes<ResourceShares>>
  implements ResourceShareModel
{
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @NotNull
  declare id: CreationOptional<RecordId>;

  @BeforeCreate
  static generateUUIDv7(instance: ResourceShares) {
    if (!instance.id) {
      instance.id = uuidv7() as RecordId;
    }
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare ownerUserId: number;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare sharedWithUserId: number;

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

  @Attribute(DataTypes.DATE)
  declare acceptedAt: Date | null;

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

  @BelongsTo(() => Users, 'sharedWithUserId')
  declare sharedWithUser?: NonAttribute<Users>;
}
