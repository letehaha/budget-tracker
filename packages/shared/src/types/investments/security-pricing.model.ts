import { SecurityModel } from './security.model';

export interface SecurityPricingModel {
  id: number; // PR

  securityId: number;
  /**
   * The date for which this pricing information is applicable. This field is crucial for tracking
   * the historical prices of securities and allows for analysis of price trends over time.
   * dd-mm-yyyy
   */
  date: Date;
  /**
   * The closing price of the security on the specified date. Closing prices are typically used in
   * financial analysis and reporting as they represent the final price at which the security was traded
   * during the trading session.
   */
  priceClose: string;
  /**
   * (Optional) The timestamp indicating the specific time the priceClose was recorded. This is particularly
   * useful when multiple price updates occur within a single day or for real-time price tracking.
   */
  priceAsOf: Date | null;
  /**
   * (Optional) A field indicating the source of the pricing information. This could be the name of the
   * data provider or the market/exchange from which the price was obtained. This field helps in
   * tracking the reliability and origin of the data.
   */
  source: string | null;

  updatedAt: Date;
  createdAt: Date;
  security: SecurityModel;
}
