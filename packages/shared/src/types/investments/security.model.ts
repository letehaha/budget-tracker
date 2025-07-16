import { ASSET_CLASS, SECURITY_PROVIDER } from './enums';
import { HoldingModel } from './holding.model';
import { InvestmentTransactionModel } from './investment-transaction.model';
import { SecurityPricingModel } from './security-pricing.model';

export interface SecurityModel {
  id: number;
  /**
   * The name of the security, typically the official name of the stock, bond,
   * or other financial instrument.
   */
  name: string | null;

  /**
   * The trading symbol or ticker associated with the security, used to uniquely
   * identify it on stock exchanges.
   */
  symbol: string | null;

  /**
   * The CUSIP number (Committee on Uniform Securities Identification Procedures) is a unique identifier
   * assigned to U.S. and Canadian securities for the purposes of facilitating clearing and settlement of trades.
   */
  cusip: string | null;

  /**
   * The ISIN number (International Securities Identification Number) is a unique code assigned to securities
   * internationally for uniform identification, which helps in reducing the risk of ambiguities in international trading.
   */
  isin: string | null;

  /**
   * (Applicable for derivative securities) The number of shares or units
   * represented by a single contract, commonly used in options and futures trading.
   */
  sharesPerContract: string | null;

  /**
   * The ISO currency code representing the currency in which the transactions
   * will be conducted. For cryptocurrencies, this code refers to
   * the specific currency linked to it (e.g., USD for BTC-USD, EUR for BTC-EUR).
   */
  currencyCode: string;

  /**
   * Crypto currency code for crypto securities. Since ticker represents not
   * just a crypto token, but an actual pair, we need to store symbol separately
   * (e.g., BTC for BTC-USD, BTC for BTC-EUR).
   */
  cryptoCurrencyCode: string | null;

  /**
   * The timestamp indicating the last time the pricing information for this
   * security was updated.
   */
  pricingLastSyncedAt: Date | null;

  /**
   * A flag indicating whether the security is considered as cash within a brokerage account.
   * This is often used for cash management in investment portfolios.
   */
  isBrokerageCash: boolean;

  /**
   * The acronym or shorthand for the exchange where this security is traded,
   * which provides an easy reference to identify the trading platform.
   *
   * Example:
   * NYSE –	New York Stock Exchange
   */
  exchangeAcronym: string | null;

  /**
   * The Market Identifier Code (MIC) as per ISO standard, representing the exchange where the security is traded.
   * MIC is a unique identification code used to identify securities trading exchanges and market platforms globally.
   * Read more: https://www.investopedia.com/terms/m/mic.asp
   */
  exchangeMic: string | null;

  /**
   * The full name of the exchange where the security is listed and traded.
   * This helps in clearly identifying the specific market platform.
   */
  exchangeName: string | null;

  /**
   * The name of the data provider or the source from which the security's information is obtained.
   * Enumerated values represent various recognized data providers.
   *
   * Useful for next cases:
   * 1. If more providers will be added and table will be expanded, by this field
   * we can identify provider-specific fields and features.
   * 2. Easy to refresh data when multiple providers exists.
   * 3. Service price, licensing, auditing, data source verification – help for
   * any legal cases
   */
  providerName: SECURITY_PROVIDER;

  /**
   * The category of assets to which this security belongs.
   * Enumerated values represent different classes of assets such as stocks, bonds, etc.
   */
  assetClass: ASSET_CLASS;
  createdAt: Date;
  updatedAt: Date;

  holdings?: HoldingModel[];
  investmentTransactions?: InvestmentTransactionModel[];
  pricing?: SecurityPricingModel[];
}
