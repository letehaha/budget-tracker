import type { RecordId } from '@bt/shared/types';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import { Attribute, BelongsTo, Default, Index, NotNull, PrimaryKey, Table } from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import Users from '../users.model';

@Table({
  timestamps: true,
  paranoid: true,
  tableName: 'VenturePlatforms',
})
export default class VenturePlatforms extends Model<
  InferAttributes<VenturePlatforms>,
  InferCreationAttributes<VenturePlatforms>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @Default(() => uuidv7())
  declare id: CreationOptional<RecordId>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.STRING(255))
  @NotNull
  declare name: string;

  @Attribute(DataTypes.STRING(2000))
  declare website: string | null;

  @Attribute(DataTypes.TEXT)
  declare description: string | null;

  @Attribute(DataTypes.DECIMAL(10, 6))
  @NotNull
  @Default('0')
  declare defaultEntryFeePct: CreationOptional<string>;

  @Attribute(DataTypes.DECIMAL(10, 6))
  @NotNull
  @Default('0')
  declare defaultMgmtFeePct: CreationOptional<string>;

  @Attribute(DataTypes.DECIMAL(10, 6))
  @NotNull
  @Default('0')
  declare defaultCarryPct: CreationOptional<string>;

  @Attribute(DataTypes.DECIMAL(10, 6))
  @NotNull
  @Default('0')
  declare defaultHurdlePct: CreationOptional<string>;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare createdAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  @NotNull
  declare updatedAt: CreationOptional<Date>;

  @Attribute(DataTypes.DATE)
  declare deletedAt: Date | null;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;
}
