import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '../enums';
import { INVESTMENT_TRANSACTION_CATEGORY } from './enums';
import { PortfolioModel } from './portfolio-models';
import { SecurityModel } from './security.model';

export interface InvestmentTransactionModel {
  id: number;
  securityId: number;
  portfolioId: number;
  transactionType: TRANSACTION_TYPES;
  date: string;
  /**
   * A descriptive name or title for the investment transaction, providing a
   * quick overview of the transaction's nature. Same as `note` in `Transactions`
   */
  name: string | null;

  /**
   * The category field specifies the type of investment transaction, such as buy, sell,
   * dividend, interest, etc. This categorization helps in organizing and analyzing
   * investment activities.
   */
  category: INVESTMENT_TRANSACTION_CATEGORY;

  /**
   * The quantity field represents the number of units or shares involved in the transaction.
   * For buy/sell transactions, it indicates how many shares were purchased or sold.
   * For dividend/interest transactions, it may be null or represent the number of shares
   * that generated the income.
   */
  quantity: string | null;

  /**
   * The price field represents the per-unit price of the security at the time of the transaction.
   * For buy/sell transactions, it's the price per share paid or received.
   * For dividend/interest transactions, it may be null or represent the price per share
   * at the time the income was generated.
   */
  price: string | null;

  /**
   * The fees field represents any transaction costs or fees associated with the investment activity.
   * This could include brokerage commissions, SEC fees, exchange fees, etc.
   */
  fees: string | null;

  /**
   * The amount field represents the total monetary value of the transaction.
   * For buy transactions: (quantity * price) + fees
   * For sell transactions: (quantity * price) - fees
   * For dividend/interest: the total amount received
   */
  amount: string;

  /**
   * The refAmount field represents the amount converted to the user's base currency.
   */
  refAmount: string;

  /**
   * "transferNature" and "transferId" are used to move funds between different
   * accounts and don't affect income/expense stats.
   */
  transferNature: TRANSACTION_TRANSFER_NATURE;
  // (hash, used to connect two transactions)
  transferId: string | null;
  updatedAt: Date;
  createdAt: Date;

  /**
   * The refFees field represents the fees converted to the user's base currency.
   */
  refFees: string;

  /**
   * The refPrice field represents the price converted to the user's base currency.
   */
  refPrice: string | null;

  /**
   * The currency code for this transaction (e.g., 'USD', 'EUR').
   */
  currencyCode: string;

  security?: SecurityModel;
  portfolio?: PortfolioModel;
}
