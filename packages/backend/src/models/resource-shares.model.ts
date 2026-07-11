import { ResourceShareModel, ResourceType, SharePermission, SharePolicy, RecordId } from '@bt/shared/types';
import { IdColumn } from '@common/types/id-column';
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';

import Users from './users.model';

@Table({
  tableName: 'ResourceShares',
  timestamps: true,
  freezeTableName: true,
})
export default class ResourceShares extends Model implements ResourceShareModel {
  @Column(IdColumn())
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  ownerUserId!: number;

  @ForeignKey(() => Users)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  sharedWithUserId!: number;

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
    type: DataType.DATE,
    allowNull: true,
  })
  acceptedAt!: Date | null;

  declare createdAt: Date;
  declare updatedAt: Date;

  @BelongsTo(() => Users, 'ownerUserId')
  owner!: Users;

  @BelongsTo(() => Users, 'sharedWithUserId')
  sharedWithUser!: Users;
}
