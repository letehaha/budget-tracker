import { AccountModel } from '../db-models';
import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '../enums';
import { INVESTMENT_TRANSACTION_CATEGORY } from './enums';
import { SecurityModel } from './security.model';

export interface InvestmentTransactionModel {
  id: number;
  /**
   * The identifier of the account associated with this transaction.
   * It links the transaction to a specific investment account.
   */
  accountId: number;
  securityId: number;
  transactionType: TRANSACTION_TYPES;
  date: string;
  /**
   * A descriptive name or title for the investment transaction, providing a
   * quick overview of the transaction's nature. Same as `note` in `Transactions`
   */
  name: string | null;
  /**
   * The monetary value involved in the transaction. Depending on the context,
   * this could represent the cost, sale proceeds, or other financial values
   * associated with the transaction. Basically quantity * price
   */
  amount: string;
  refAmount: string;

  fees: string;
  refFees: string;

  /**
   * * The quantity of the security involved in the transaction. This is crucial
   * for tracking the changes in holdings as a result of the transaction.
   */
  quantity: string;

  /**
   * The price per unit of the security at the time of the transaction.
   * This is used to calculate the total transaction amount and update the cost
   * basis of the holding.
   */
  price: string;
  refPrice: string;

  /**
   * The ISO currency code or standard cryptocurrency code representing the currency
   * in which the transaction was conducted. For cryptocurrencies, this code refers to
   * the specific cryptocurrency involved (e.g., BTC for Bitcoin, ETH for Ethereum).
   */
  currencyCode: string;
  /**
   * A category that classifies the nature of the investment transaction.
   * This could include types like 'buy', 'sell', 'dividend', 'interest', etc.,
   * providing a clear context for the transaction's purpose and impact on the investment portfolio.
   */
  category: INVESTMENT_TRANSACTION_CATEGORY;
  /**
   * "transferNature" and "transferId" are used to move funds between different
   * accounts and don't affect income/expense stats.
   */
  transferNature: TRANSACTION_TRANSFER_NATURE;
  // (hash, used to connect two transactions)
  transferId: string | null;
  updatedAt: Date;
  createdAt: Date;

  security?: SecurityModel;
  account?: AccountModel;
}
