import type { RecordId } from '@bt/shared/types';
import { DEPRECIATION_PRESET, VEHICLE_CLASS } from '@bt/shared/types';
import type { Money } from '@common/types/money';
import { moneyGetCents, moneySetCents } from '@common/types/money-column';
import Accounts from '@models/accounts.model';
import Users from '@models/users.model';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import { Attribute, BelongsTo, Default, NotNull, PrimaryKey, Table, Unique } from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

@Table({
  tableName: 'Vehicles',
  timestamps: true,
  freezeTableName: true,
})
export default class Vehicles extends Model<InferAttributes<Vehicles>, InferCreationAttributes<Vehicles>> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @Default(() => uuidv7())
  declare id: CreationOptional<RecordId>;

  @Attribute(DataTypes.UUID)
  @NotNull
  @Unique
  declare accountId: RecordId;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  declare userId: number;

  @Attribute(DataTypes.STRING(100))
  @NotNull
  declare make: string;

  @Attribute(DataTypes.STRING(100))
  @NotNull
  declare model: string;

  @Attribute(DataTypes.STRING(100))
  declare trim: string | null;

  @Attribute(DataTypes.SMALLINT)
  @NotNull
  declare year: number;

  @Attribute(DataTypes.STRING(20))
  @NotNull
  @Default(VEHICLE_CLASS.sedan)
  declare vehicleClass: CreationOptional<VEHICLE_CLASS>;

  @Attribute(DataTypes.BIGINT)
  @NotNull
  @Default(0)
  get purchasePrice(): Money {
    return moneyGetCents(this, 'purchasePrice');
  }
  set purchasePrice(val: Money | number) {
    moneySetCents(this, 'purchasePrice', val);
  }

  @Attribute(DataTypes.DATEONLY)
  @NotNull
  declare purchaseDate: string;

  @Attribute(DataTypes.BIGINT)
  get valueAnchor(): Money | null {
    return moneyGetCents(this, 'valueAnchor');
  }
  set valueAnchor(val: Money | number | null) {
    moneySetCents(this, 'valueAnchor', val);
  }

  @Attribute(DataTypes.DATEONLY)
  declare valueAnchorDate: string | null;

  @Attribute(DataTypes.STRING(20))
  @NotNull
  @Default(DEPRECIATION_PRESET.classDefault)
  declare depreciationPreset: CreationOptional<DEPRECIATION_PRESET>;

  @Attribute(DataTypes.DECIMAL(5, 2))
  declare customAnnualRatePct: string | null;

  @Attribute(DataTypes.DECIMAL(5, 2))
  @NotNull
  @Default(10)
  declare salvageFloorPct: CreationOptional<string>;

  @Attribute(DataTypes.INTEGER)
  declare currentMileage: number | null;

  @Attribute(DataTypes.DATE)
  declare valueLastComputedAt: Date | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Accounts, 'accountId')
  declare account?: NonAttribute<Accounts>;

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;
}
