import { ASSET_CLASS } from '@bt/shared/types';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioBalances from '@models/investments/portfolio-balances.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Securities from '@models/investments/securities.model';
import { format } from 'date-fns';

/** Shared `yyyy-MM-dd` key for the rate/price lookup maps in this folder. */
export const formatDateKey = (date: Date | string): string => format(date, 'yyyy-MM-dd');

export interface CombinedBalanceHistoryItem {
  date: string;
  /**
   * Sum of all "real" account categories (cash, credit card, savings, etc.).
   * Vehicles are excluded so the line tracks actual cash position rather than
   * being dragged down by depreciation curves on assets the user can't spend.
   */
  accountsBalance: number;
  portfoliosBalance: number;
  venturesBalance: number;
  /** Sum of vehicle-account balances. Separated to avoid polluting accountsBalance. */
  vehiclesBalance: number;
  totalBalance: number;
}

export type TransactionRow = Pick<
  InvestmentTransaction,
  | 'portfolioId'
  | 'securityId'
  | 'category'
  | 'date'
  | 'quantity'
  | 'refAmount'
  | 'refFees'
  | 'currencyCode'
  | 'settlementAmount'
  | 'settlementCurrencyCode'
>;

export type TransferRow = Pick<
  PortfolioTransfers,
  'fromPortfolioId' | 'toPortfolioId' | 'amount' | 'currencyCode' | 'toCurrencyCode' | 'toAmount' | 'date'
>;

export type CurrentBalanceRow = Pick<PortfolioBalances, 'portfolioId' | 'currencyCode' | 'totalCash' | 'refTotalCash'>;

export type SecurityRow = Pick<Securities, 'id' | 'currencyCode' | 'assetClass'>;

export interface HoldingState {
  quantity: number;
  costBasis: number;
  currencyCode: string;
  assetClass: ASSET_CLASS;
}
