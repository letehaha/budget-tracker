import { AccountModel, CurrencyModel, UserModel } from '../db-models';
import { PORTFOLIO_TYPE } from './enums';
import { HoldingModel } from './holding.model';
import { InvestmentTransactionModel } from './investment-transaction.model';

export interface PortfolioBalanceModel {
  portfolioId: number;
  currencyId: number;
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
  id: number;
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
  id: number;
  userId: number;
  fromAccountId: number | null;
  toPortfolioId: number | null;
  fromPortfolioId: number | null;
  toAccountId: number | null;
  amount: string;
  refAmount: string;
  currencyId: number;
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
}
