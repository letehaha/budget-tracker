import cls from 'cls-hooked';
import { Sequelize } from 'sequelize-typescript';

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
import SecurityCurrencyCacheModel from './investments/security-currency-cache.model';
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
import TransferSuggestionDismissalsModel from './transfer-suggestion-dismissals.model';
import UserExchangeRatesModel from './user-exchange-rates.model';
import UserMerchantCategoryCodesModel from './user-merchant-category-codes.model';
import UserSettingsModel from './user-settings.model';
import UsersCurrenciesModel from './users-currencies.model';
import UsersModel from './users.model';

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
  SecurityCurrencyCacheModel,
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
  TransferSuggestionDismissalsModel,
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
