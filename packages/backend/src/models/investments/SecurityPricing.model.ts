import { Table, Column, Model, ForeignKey, DataType, BelongsTo } from 'sequelize-typescript';
import Securities from "./Securities.model";
import { SecurityPricingModel } from "@bt/shared/types/investments"

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
export default class SecurityPricing extends Model implements SecurityPricingModel {
  @Column({
    primaryKey: true,
    autoIncrement: true,
    type: DataType.INTEGER,
  })
  id!: number;

  @ForeignKey(() => Securities)
  @Column({ type: DataType.INTEGER, allowNull: false })
  securityId!: number;

  /**
   * The date for which this pricing information is applicable. This field is crucial for tracking
   * the historical prices of securities and allows for analysis of price trends over time.
   */
  @Column({ type: DataType.DATEONLY, allowNull: false })
  date!: Date;

  /**
   * The closing price of the security on the specified date. Closing prices are typically used in
   * financial analysis and reporting as they represent the final price at which the security was traded
   * during the trading session.
   */
  @Column({ type: DataType.DECIMAL(20, 10), allowNull: false })
  priceClose!: string;

  /**
   * (Optional) The timestamp indicating the specific time the priceClose was recorded. This is particularly
   * useful when multiple price updates occur within a single day or for real-time price tracking.
   */
  @Column({ type: DataType.DATE, allowNull: true })
  priceAsOf!: Date | null;

  /**
   * (Optional) A field indicating the source of the pricing information. This could be the name of the
   * data provider or the market/exchange from which the price was obtained. This field helps in
   * tracking the reliability and origin of the data.
   */
  @Column({ type: DataType.STRING, allowNull: true })
  source!: string | null;

  @Column({ type: DataType.DATE, allowNull: false })
  createdAt!: Date;
  @Column({ type: DataType.DATE, allowNull: false })
  updatedAt!: Date;

  @BelongsTo(() => Securities)
  security!: Securities;
}
