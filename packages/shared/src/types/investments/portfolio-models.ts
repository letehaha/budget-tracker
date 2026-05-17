import { AccountModel, CurrencyModel, UserModel } from '../db-models';
import { PORTFOLIO_TYPE } from './enums';
import { HoldingModel } from './holding.model';
import { InvestmentTransactionModel } from './investment-transaction.model';

export interface PortfolioBalanceModel {
  portfolioId: string;
  currencyCode: string;
  availableCash: string;
  totalCash: string;
  refAvailableCash: string;
  refTotalCash: string;
  createdAt: Date;
  updatedAt: Date;

  // Associations
  portfolio?: PortfolioModel;
  currency?: CurrencyModel;
}

export interface PortfolioModel {
  id: string;
  name: string;
  userId: number;
  portfolioType: PORTFOLIO_TYPE;
  description: string | null;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Associations
  user?: UserModel;
  holdings?: HoldingModel[];
  investmentTransactions?: InvestmentTransactionModel[];
  balances?: PortfolioBalanceModel[];
}

export interface PortfolioTransferModel {
  id: string;
  userId: number;
  fromAccountId: string | null;
  toPortfolioId: string | null;
  fromPortfolioId: string | null;
  toAccountId: string | null;
  amount: string;
  refAmount: string;
  currencyCode: string;
  toCurrencyCode: string | null;
  toAmount: string | null;
  refToAmount: string | null;
  transactionId: string | null;
  metaData: Record<string, unknown> | null;
  date: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Associations
  user?: UserModel;
  fromAccount?: AccountModel;
  toAccount?: AccountModel;
  fromPortfolio?: PortfolioModel;
  toPortfolio?: PortfolioModel;
  currency?: CurrencyModel;
  toCurrency?: CurrencyModel;
}
