import type { RecordId } from '@bt/shared/types';
import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
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
import VentureDeals from './venture-deals.model';
import VentureEventLinks from './venture-event-links.model';

@Table({
  timestamps: true,
  tableName: 'VentureEvents',
})
export default class VentureEvents extends Model<
  InferAttributes<VentureEvents>,
  InferCreationAttributes<VentureEvents>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  @Default(() => uuidv7())
  declare id: CreationOptional<RecordId>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Index
  declare userId: number;

  @Attribute(DataTypes.UUID)
  @NotNull
  @Index
  declare dealId: RecordId;

  @Attribute(DataTypes.STRING(32))
  @NotNull
  @Index
  declare type: VENTURE_EVENT_TYPE;

  @Attribute(DataTypes.DATEONLY)
  @NotNull
  @Index
  declare eventDate: string;

  @Attribute(DataTypes.DECIMAL(20, 10))
  get grossAmount(): Money | null {
    const raw = this.getDataValue('grossAmount');
    if (raw === null || raw === undefined) return null;
    return moneyGetDecimal(this, 'grossAmount');
  }
  set grossAmount(val: Money | string | number | null) {
    if (val === null) {
      this.setDataValue('grossAmount', null);
      return;
    }
    moneySetDecimal(this, 'grossAmount', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(20, 10))
  get gpCarryAmount(): Money | null {
    const raw = this.getDataValue('gpCarryAmount');
    if (raw === null || raw === undefined) return null;
    return moneyGetDecimal(this, 'gpCarryAmount');
  }
  set gpCarryAmount(val: Money | string | number | null) {
    if (val === null) {
      this.setDataValue('gpCarryAmount', null);
      return;
    }
    moneySetDecimal(this, 'gpCarryAmount', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(20, 10))
  get lpNetAmount(): Money | null {
    const raw = this.getDataValue('lpNetAmount');
    if (raw === null || raw === undefined) return null;
    return moneyGetDecimal(this, 'lpNetAmount');
  }
  set lpNetAmount(val: Money | string | number | null) {
    if (val === null) {
      this.setDataValue('lpNetAmount', null);
      return;
    }
    moneySetDecimal(this, 'lpNetAmount', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(20, 10))
  get refAmount(): Money | null {
    const raw = this.getDataValue('refAmount');
    if (raw === null || raw === undefined) return null;
    return moneyGetDecimal(this, 'refAmount');
  }
  set refAmount(val: Money | string | number | null) {
    if (val === null) {
      this.setDataValue('refAmount', null);
      return;
    }
    moneySetDecimal(this, 'refAmount', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(20, 10))
  get navAfter(): Money | null {
    const raw = this.getDataValue('navAfter');
    if (raw === null || raw === undefined) return null;
    return moneyGetDecimal(this, 'navAfter');
  }
  set navAfter(val: Money | string | number | null) {
    if (val === null) {
      this.setDataValue('navAfter', null);
      return;
    }
    moneySetDecimal(this, 'navAfter', val, 10);
  }

  @Attribute(DataTypes.DECIMAL(10, 6))
  declare quantityPct: string | null;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(false)
  declare lpNetAmountOverridden: CreationOptional<boolean>;

  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(false)
  declare gpCarryOverridden: CreationOptional<boolean>;

  /**
   * Snapshot of the LP principal that this distribution/exit event returned.
   * Load-bearing: every downstream carry computation reads it via
   * `computeCumulativePrincipalReturnedBefore`. Null for non-carry events.
   */
  @Attribute(DataTypes.DECIMAL(20, 10))
  declare principalReturnedThisEvent: string | null;

  @Attribute(DataTypes.STRING(3))
  @NotNull
  @Index
  declare currencyCode: string;

  @Attribute(DataTypes.STRING(32))
  @NotNull
  @Default(VENTURE_CASH_FLOW_MODE.none)
  declare cashFlowMode: CreationOptional<VENTURE_CASH_FLOW_MODE>;

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

  @BelongsTo(() => Users, 'userId')
  declare user?: NonAttribute<Users>;

  @BelongsTo(() => VentureDeals, 'dealId')
  declare deal?: NonAttribute<VentureDeals>;

  @BelongsTo(() => Currencies, 'currencyCode')
  declare currency?: NonAttribute<Currencies>;

  @HasMany(() => VentureEventLinks, 'ventureEventId')
  declare links?: NonAttribute<VentureEventLinks[]>;
}
