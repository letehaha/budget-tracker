import { Sequelize } from '@sequelize/core';
import { PostgresDialect } from '@sequelize/postgres';

import AccountGroupingModel from './accounts-groups/account-grouping.model';
import AccountGroupsModel from './accounts-groups/account-groups.model';
import AccountsModel from './accounts.model';
import BalancesModel from './balances.model';
import BankDataProviderConnectionsModel from './bank-data-provider-connections.model';
import BinanceUsersModel from './binance/user-settings.model';
import BudgetCategoriesModel from './budget-categories.model';
import BudgetTransactionsModel from './budget-transactions.model';
import BudgetModel from './budget.model';
import CategoriesModel from './categories.model';
import CurrenciesModel from './currencies.model';
import ExchangeRatesModel from './exchange-rates.model';
import HoldingsModel from './investments/holdings.model';
import InvestmentTransactionModel from './investments/investment-transaction.model';
import PortfolioBalancesModel from './investments/portfolio-balances.model';
import PortfolioTransfersModel from './investments/portfolio-transfers.model';
import PortfoliosModel from './investments/portfolios.model';
import SecuritiesModel from './investments/securities.model';
import SecurityPricingModel from './investments/security-pricing.model';
import MerchantCategoryCodesModel from './merchant-category-codes.model';
import NotificationsModel from './notifications.model';
import PaymentReminderNotificationsModel from './payment-reminder-notifications.model';
import PaymentReminderPeriodsModel from './payment-reminder-periods.model';
import PaymentRemindersModel from './payment-reminders.model';
import RefundTransactionsModel from './refund-transactions.model';
import SubscriptionCandidatesModel from './subscription-candidates.model';
import SubscriptionTransactionsModel from './subscription-transactions.model';
import SubscriptionsModel from './subscriptions.model';
import TagRemindersModel from './tag-reminders.model';
import TagsModel from './tags.model';
import TransactionGroupItemsModel from './transaction-group-items.model';
import TransactionGroupsModel from './transaction-groups.model';
import TransactionSplitsModel from './transaction-splits.model';
import TransactionTagsModel from './transaction-tags.model';
import TransactionsModel from './transactions.model';
import UserExchangeRatesModel from './user-exchange-rates.model';
import UserMerchantCategoryCodesModel from './user-merchant-category-codes.model';
import UserSettingsModel from './user-settings.model';
import UsersCurrenciesModel from './users-currencies.model';
import UsersModel from './users.model';

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
AccountGroupsModel.hasMany(AccountGroupsModel, {
  foreignKey: 'parentGroupId',
  as: 'childGroups',
  inverse: {
    as: 'parentGroup',
  },
});

connection.sequelize = sequelize;
connection.Sequelize = Sequelize;

export { connection };
