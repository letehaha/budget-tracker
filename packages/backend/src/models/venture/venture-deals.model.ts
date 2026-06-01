import type { RecordId } from '@bt/shared/types';
import { VENTURE_DEAL_STATUS, VENTURE_SPV_SUBTYPE, VENTURE_VEHICLE_TYPE } from '@bt/shared/types/venture';
import type { Money } from '@common/types/money';
import { moneyGetDecimal, moneySetDecimal } from '@common/types/money-column';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import {
  Attribute,
  BelongsTo,
  Default,
  HasMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import Currencies from '../currencies.model';
import Users from '../users.model';
import VentureEvents from './venture-events.model';
import VenturePlatforms from './venture-platforms.model';

@Table({
  timestamps: true,
  paranoid: true,
  tableName: 'VentureDeals',
})
export default class VentureDeals extends Model<InferAttributes<VentureDeals>, InferCreationAttributes<VentureDeals>> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @Default(() => uuidv7())
  declare id: CreationOptional<RecordId>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.UUID)
  @Index
  declare platformId: RecordId | null;

  @Attribute(DataTypes.STRING(255))
  @NotNull
  declare name: string;

  @Attribute(DataTypes.STRING(32))
  @NotNull
  @Default(VENTURE_VEHICLE_TYPE.spv)
  declare vehicleType: CreationOptional<VENTURE_VEHICLE_TYPE>;

  @Attribute(DataTypes.STRING(32))
  declare spvSubtype: VENTURE_SPV_SUBTYPE | null;

  @Attribute(DataTypes.STRING(255))
  declare targetCompany: string | null;

  @Attribute(DataTypes.STRING(3))
  @NotNull
  @Index
  declare currencyCode: string;

  @Attribute(DataTypes.STRING(32))
  @NotNull
  @Index
  @Default(VENTURE_DEAL_STATUS.outstanding)
  declare status: CreationOptional<VENTURE_DEAL_STATUS>;

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  get principal(): Money {
    return moneyGetDecimal(this, 'principal');
  }
  set principal(val: Money | string | number) {
    moneySetDecimal(this, 'principal', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  @Default('0')
  get entryFee(): Money {
    return moneyGetDecimal(this, 'entryFee');
  }
  set entryFee(val: Money | string | number) {
    moneySetDecimal(this, 'entryFee', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(10, 6))
  @NotNull
  @Default('0')
  declare entryFeePct: CreationOptional<string>;

  @Attribute(DataTypes.DECIMAL(10, 6))
  @NotNull
  @Default('0')
  declare mgmtFeePct: CreationOptional<string>;

  @Attribute(DataTypes.DECIMAL(10, 6))
  @NotNull
  @Default('0')
  declare carryPct: CreationOptional<string>;

  @Attribute(DataTypes.DECIMAL(10, 6))
  @NotNull
  @Default('0')
  declare hurdlePct: CreationOptional<string>;

  @Attribute(DataTypes.DATEONLY)
  @NotNull
  @Index
  declare investmentDate: string;

  @Attribute(DataTypes.DATEONLY)
  declare expectedExitDate: string | null;

  @Attribute(DataTypes.TEXT)
  declare notes: string | null;

  @Attribute(DataTypes.JSONB)
  declare metaData: Record<string, unknown> | null;

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

  @BelongsTo(() => VenturePlatforms, 'platformId')
  declare platform?: NonAttribute<VenturePlatforms>;

  @BelongsTo(() => Currencies, 'currencyCode')
  declare currency?: NonAttribute<Currencies>;

  @HasMany(() => VentureEvents, 'dealId')
  declare events?: NonAttribute<VentureEvents[]>;
}
