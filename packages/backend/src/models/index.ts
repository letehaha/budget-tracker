import { Sequelize } from '@sequelize/core';
import { PostgresDialect } from '@sequelize/postgres';
import { AsyncLocalStorage } from 'async_hooks';

import AccountGroupingModel from './accounts-groups/AccountGrouping.model';
import AccountGroupsModel from './accounts-groups/AccountGroups.model';
import AccountsModel from './Accounts.model';
import BalancesModel from './Balances.model';
import BankDataProviderConnectionsModel from './BankDataProviderConnections.model';
import BinanceUsersModel from './binance/UserSettings.model';
import BudgetModel from './Budget.model';
import BudgetCategoriesModel from './BudgetCategories.model';
import BudgetTransactionsModel from './BudgetTransactions.model';
import CategoriesModel from './Categories.model';
import CurrenciesModel from './Currencies.model';
import ExchangeRatesModel from './ExchangeRates.model';
import HoldingsModel from './investments/Holdings.model';
import InvestmentTransactionModel from './investments/InvestmentTransaction.model';
import PortfolioBalancesModel from './investments/PortfolioBalances.model';
import PortfoliosModel from './investments/Portfolios.model';
import PortfolioTransfersModel from './investments/PortfolioTransfers.model';
import SecuritiesModel from './investments/Securities.model';
import SecurityPricingModel from './investments/SecurityPricing.model';
import MerchantCategoryCodesModel from './MerchantCategoryCodes.model';
import NotificationsModel from './Notifications.model';
import PaymentReminderNotificationsModel from './payment-reminder-notifications.model';
import PaymentReminderPeriodsModel from './payment-reminder-periods.model';
import PaymentRemindersModel from './payment-reminders.model';
import RefundTransactionsModel from './RefundTransactions.model';
import SubscriptionCandidatesModel from './SubscriptionCandidates.model';
import SubscriptionsModel from './Subscriptions.model';
import SubscriptionTransactionsModel from './SubscriptionTransactions.model';
import TagRemindersModel from './TagReminders.model';
import TagsModel from './Tags.model';
import TransactionGroupItemsModel from './TransactionGroupItems.model';
import TransactionGroupsModel from './TransactionGroups.model';
import TransactionsModel from './Transactions.model';
import TransactionSplitsModel from './TransactionSplits.model';
import TransactionTagsModel from './TransactionTags.model';
import UserExchangeRatesModel from './UserExchangeRates.model';
import UserMerchantCategoryCodesModel from './UserMerchantCategoryCodes.model';
import UsersModel from './Users.model';
import UsersCurrenciesModel from './UsersCurrencies.model';
import UserSettingsModel from './UserSettings.model';

// Sequelize v7 uses AsyncLocalStorage instead of cls-hooked
export const transactionStorage = new AsyncLocalStorage<object>();

const connection: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sequelize?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Sequelize?: any;
} = {};

const models = [
  UsersModel,
  AccountsModel,
  BalancesModel,
  BankDataProviderConnectionsModel,
  CategoriesModel,
  CurrenciesModel,
  ExchangeRatesModel,
  MerchantCategoryCodesModel,
  NotificationsModel,
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
  BudgetCategoriesModel,
  BudgetTransactionsModel,
  TagsModel,
  TagRemindersModel,
  TransactionTagsModel,
  TransactionSplitsModel,
  TransactionGroupsModel,
  TransactionGroupItemsModel,
  HoldingsModel,
  InvestmentTransactionModel,
  SecuritiesModel,
  SecurityPricingModel,
  PortfoliosModel,
  PortfolioBalancesModel,
  PortfolioTransfersModel,
  SubscriptionsModel,
  SubscriptionTransactionsModel,
  SubscriptionCandidatesModel,
  PaymentRemindersModel,
  PaymentReminderPeriodsModel,
  PaymentReminderNotificationsModel,
];

const databaseName =
  process.env.NODE_ENV === 'test'
    ? `${process.env.APPLICATION_DB_DATABASE}-${process.env.VITEST_POOL_ID || process.env.JEST_WORKER_ID || '1'}`
    : process.env.APPLICATION_DB_DATABASE!;

const sequelize = new Sequelize({
  dialect: PostgresDialect,
  host: process.env.APPLICATION_DB_HOST,
  user: process.env.APPLICATION_DB_USERNAME,
  password: process.env.APPLICATION_DB_PASSWORD,
  database: databaseName,
  port: Number(process.env.APPLICATION_DB_PORT),
  models,
  pool: {
    max: 50,
    evict: 10000,
  },
  logging: process.env.DB_QUERY_LOGGING === 'true' ? console.log : false,
});

if (process.env.NODE_ENV === 'development') {
  console.log('DBConfig', {
    host: process.env.APPLICATION_DB_HOST,
    user: process.env.APPLICATION_DB_USERNAME,
    database: databaseName,
    port: process.env.APPLICATION_DB_PORT,
  });
}

// Setup self-referencing associations that cannot use decorators
// AccountGroup parent/child self-reference
AccountGroupsModel.belongsTo(AccountGroupsModel, {
  foreignKey: 'parentGroupId',
  as: 'parentGroup',
});
AccountGroupsModel.hasMany(AccountGroupsModel, {
  foreignKey: 'parentGroupId',
  as: 'childGroups',
});

connection.sequelize = sequelize;
connection.Sequelize = Sequelize;

export { connection };
