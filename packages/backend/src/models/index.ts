import cls from 'cls-hooked';
import { Sequelize } from 'sequelize-typescript';

import AccountsModel from './Accounts.model';
import BalancesModel from './Balances.model';
import BankDataProviderConnectionsModel from './BankDataProviderConnections.model';
import BudgetModel from './Budget.model';
import BudgetTransactionsModel from './BudgetTransactions.model';
import CategoriesModel from './Categories.model';
import CurrenciesModel from './Currencies.model';
import ExchangeRatesModel from './ExchangeRates.model';
import MerchantCategoryCodesModel from './MerchantCategoryCodes.model';
import RefundTransactionsModel from './RefundTransactions.model';
import TransactionSplitsModel from './TransactionSplits.model';
import TransactionsModel from './Transactions.model';
import UserExchangeRatesModel from './UserExchangeRates.model';
import UserMerchantCategoryCodesModel from './UserMerchantCategoryCodes.model';
import UserSettingsModel from './UserSettings.model';
import UsersModel from './Users.model';
import UsersCurrenciesModel from './UsersCurrencies.model';
import AccountGroupingModel from './accounts-groups/AccountGrouping.model';
import AccountGroupsModel from './accounts-groups/AccountGroups.model';
import BinanceUsersModel from './binance/UserSettings.model';
import HoldingsModel from './investments/Holdings.model';
import InvestmentTransactionModel from './investments/InvestmentTransaction.model';
import PortfolioBalancesModel from './investments/PortfolioBalances.model';
import PortfolioTransfersModel from './investments/PortfolioTransfers.model';
import PortfoliosModel from './investments/Portfolios.model';
import SecuritiesModel from './investments/Securities.model';
import SecurityPricingModel from './investments/SecurityPricing.model';

export const namespace = cls.createNamespace('budget-tracker-namespace');
Sequelize.useCLS(namespace);

const connection: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sequelize?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Sequelize?: any;
} = {};

const DBConfig: Record<string, unknown> = {
  host: process.env.APPLICATION_DB_HOST,
  username: process.env.APPLICATION_DB_USERNAME,
  password: process.env.APPLICATION_DB_PASSWORD,
  database: process.env.APPLICATION_DB_DATABASE,
  port: process.env.APPLICATION_DB_PORT,
  dialect: process.env.APPLICATION_DB_DIALECT,
};

const models = [
  UsersModel,
  AccountsModel,
  BalancesModel,
  BankDataProviderConnectionsModel,
  CategoriesModel,
  CurrenciesModel,
  ExchangeRatesModel,
  MerchantCategoryCodesModel,
  RefundTransactionsModel,
  TransactionsModel,
  UserExchangeRatesModel,
  UserMerchantCategoryCodesModel,
  UserSettingsModel,
  UsersCurrenciesModel,
  AccountGroupingModel,
  AccountGroupsModel,
  BinanceUsersModel,
  BudgetModel,
  BudgetTransactionsModel,
  TransactionSplitsModel,
  HoldingsModel,
  InvestmentTransactionModel,
  SecuritiesModel,
  SecurityPricingModel,
  PortfoliosModel,
  PortfolioBalancesModel,
  PortfolioTransfersModel,
];

const sequelize = new Sequelize({
  ...DBConfig,
  database:
    process.env.NODE_ENV === 'test'
      ? `${DBConfig.database}-${process.env.JEST_WORKER_ID}`
      : (DBConfig.database as string),
  models,
  pool: {
    max: 50,
    evict: 10000,
  },
  logging: process.env.DB_QUERY_LOGGING === 'true',
});

if (process.env.NODE_ENV === 'development') {
  console.log('DBConfig', DBConfig);
}

connection.sequelize = sequelize;
connection.Sequelize = Sequelize;

export { connection };
