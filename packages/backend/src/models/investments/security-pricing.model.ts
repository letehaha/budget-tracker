import type { RecordId } from '@bt/shared/types';
import type { Money } from '@common/types/money';
import { moneyGetDecimal, moneySetDecimal } from '@common/types/money-column';
import type { CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from '@sequelize/core';
import { DataTypes, Model } from '@sequelize/core';
import {
  Attribute,
  BeforeCreate,
  BelongsTo,
  Index,
  NotNull,
  PrimaryKey,
  Table,
} from '@sequelize/core/decorators-legacy';
import { v7 as uuidv7 } from 'uuid';

import Securities from './securities.model';

/**
 * Represents the dynamic pricing information of financial securities over time.
 * This table is specifically designed to store time-sensitive data like daily
 * closing prices, and it complements the static data  stored in the Security
 * table. By segregating pricing data from the Security table, the design ensures
 * efficient handling of frequently changing market data, which is crucial for
 * accurate and up-to-date financial analysis and reporting.
 */
@Table({
  timestamps: true,
  tableName: 'SecurityPricings',
  indexes: [
    {
      unique: true,
      fields: ['securityId', 'date'],
      name: 'security_pricing_unique_security_date_idx',
    },
  ],
})
export default class SecurityPricing extends Model<
  InferAttributes<SecurityPricing>,
  InferCreationAttributes<SecurityPricing>
> {
  @Attribute(DataTypes.UUID)
  @PrimaryKey
  declare id: CreationOptional<RecordId>;

  @BeforeCreate
  static generateUUIDv7(instance: SecurityPricing) {
    if (!instance.id) {
      instance.id = uuidv7() as RecordId;
    }
  }

  @Attribute(DataTypes.UUID)
  @NotNull
  @Index
  declare securityId: RecordId;

  /**
   * The canonical timestamp this pricing row represents. The underlying
   * Postgres column is `TIMESTAMP WITH TIME ZONE` (Sequelize's `DataType.DATE`
   * maps to TIMESTAMPTZ — confusingly named; SQL `DATE` would be `DATEONLY`).
   * The same column supports both daily and intraday cadences:
   *
   *   - Stocks: midnight UTC of the trading day (one row per security per day).
   *   - Crypto: CoinGecko's `last_updated_at` from the batch fetch — the
   *     moment their oracle updated the price. Hourly cron produces multiple
   *     rows per day per coin; the unique (securityId, date) index naturally
   *     dedupes consecutive runs that see the same upstream timestamp.
   */
  @Attribute(DataTypes.DATE)
  @NotNull
  declare date: Date;

  /**
   * The closing price of the security on the specified date. Closing prices are typically used in
   * financial analysis and reporting as they represent the final price at which the security was traded
   * during the trading session.
   */
  @Attribute(DataTypes.DECIMAL(20, 10))
  @NotNull
  get priceClose(): Money {
    return moneyGetDecimal(this, 'priceClose');
  }
  set priceClose(val: Money | string | number) {
    moneySetDecimal(this, 'priceClose', val, 10);
  }

  /**
   * (Optional) The timestamp indicating the specific time the priceClose was recorded. This is particularly
   * useful when multiple price updates occur within a single day or for real-time price tracking.
   */
  @Attribute(DataTypes.DATE)
  declare priceAsOf: Date | null;

  /**
   * (Optional) A field indicating the source of the pricing information. This could be the name of the
   * data provider or the market/exchange from which the price was obtained. This field helps in
   * tracking the reliability and origin of the data.
   */
  @Attribute(DataTypes.STRING)
  declare source: string | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  @BelongsTo(() => Securities, 'securityId')
  declare security?: NonAttribute<Securities>;
}
