import { RecordId } from '@bt/shared/types';
import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import { Money } from '@common/types/money';
import { MoneyColumn, moneyGetDecimal, moneySetDecimal } from '@common/types/money-column';
import { BelongsTo, Column, DataType, ForeignKey, HasMany, Index, Model, Table } from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

import Currencies from '../currencies.model';
import Users from '../users.model';
import VentureDeals from './venture-deals.model';
import VentureEventLinks from './venture-event-links.model';

@Table({
  timestamps: true,
  tableName: 'VentureEvents',
})
export default class VentureEvents extends Model {
  @Column({
    primaryKey: true,
    unique: true,
    allowNull: false,
    type: DataType.UUID,
    defaultValue: () => uuidv7(),
  })
  declare id: RecordId;

  @ForeignKey(() => Users)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @ForeignKey(() => VentureDeals)
  @Index
  @Column({ type: DataType.UUID, allowNull: false })
  dealId!: RecordId;

  @Index
  @Column({ type: DataType.STRING(32), allowNull: false })
  type!: VENTURE_EVENT_TYPE;

  @Index
  @Column({ type: DataType.DATEONLY, allowNull: false })
  eventDate!: string;

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10, allowNull: true }))
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

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10, allowNull: true }))
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

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10, allowNull: true }))
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

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10, allowNull: true }))
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

  @Column(MoneyColumn({ storage: 'decimal', precision: 20, scale: 10, allowNull: true }))
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

  @Column({ type: DataType.DECIMAL(10, 6), allowNull: true })
  quantityPct!: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  lpNetAmountOverridden!: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  gpCarryOverridden!: boolean;

  /**
   * Snapshot of the LP principal that this distribution/exit event returned.
   * Load-bearing: every downstream carry computation reads it via
   * `computeCumulativePrincipalReturnedBefore`. Null for non-carry events.
   */
  @Column({ type: DataType.DECIMAL(20, 10), allowNull: true })
  principalReturnedThisEvent!: string | null;

  @ForeignKey(() => Currencies)
  @Index
  @Column({ type: DataType.STRING(3), allowNull: false })
  currencyCode!: string;

  @Column({
    type: DataType.STRING(32),
    allowNull: false,
    defaultValue: VENTURE_CASH_FLOW_MODE.none,
  })
  cashFlowMode!: VENTURE_CASH_FLOW_MODE;

  @Column({ type: DataType.TEXT, allowNull: true })
  notes!: string | null;

  @Column({ type: DataType.JSONB, allowNull: true, defaultValue: null })
  metaData!: Record<string, unknown> | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare updatedAt: Date;

  @BelongsTo(() => Users)
  user?: Users;

  @BelongsTo(() => VentureDeals)
  deal?: VentureDeals;

  @BelongsTo(() => Currencies, 'currencyCode')
  currency?: Currencies;

  @HasMany(() => VentureEventLinks)
  links?: VentureEventLinks[];
}
