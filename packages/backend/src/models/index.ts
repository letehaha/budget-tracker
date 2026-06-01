import type { RecordId } from '@bt/shared/types';
import { DataTypes, type Model, Sequelize } from '@sequelize/core';
import { PostgresDialect } from '@sequelize/postgres';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';

// Ensure TIMESTAMP/TIMESTAMPTZ/DATE columns are parsed as Date objects.
// @sequelize/postgres uses pg's nested pg-types instance, so we register via
// pg.types (not the hoisted pg-types) so raw: true queries return Date.
const toDate = (value: string | null) => (value === null ? null : new Date(value));
pg.types.setTypeParser(1082, toDate); // DATE
pg.types.setTypeParser(1114, toDate); // TIMESTAMP WITHOUT TIME ZONE
pg.types.setTypeParser(1184, toDate); // TIMESTAMP WITH TIME ZONE

// node-postgres returns BIGINT as string to preserve precision. Our cents
// columns are BIGINT, but cent values stay far below JS Number's safe 2^53
// ceiling (~$90T). Parse to Number so model getters, hooks, raw queries, and
// API serializers all see numbers uniformly. pg only invokes the parser for
// non-null values, so we don't need a null branch.
pg.types.setTypeParser(20, (val) => Number(val));

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
import { connection } from './connection';
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
import ResourceSharesModel from './resource-shares.model';
import ShareInvitationsModel from './share-invitations.model';
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
import VehiclesModel from './vehicles.model';
import VentureDealsModel from './venture/venture-deals.model';
import VentureEventLinksModel from './venture/venture-event-links.model';
import VentureEventsModel from './venture/venture-events.model';
import VenturePlatformsModel from './venture/venture-platforms.model';

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
  ResourceSharesModel,
  ShareInvitationsModel,
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
  VenturePlatformsModel,
  VentureDealsModel,
  VentureEventsModel,
  VentureEventLinksModel,
  VehiclesModel,
];

const databaseName =
  process.env.NODE_ENV === 'test'
    ? `${process.env.APPLICATION_DB_DATABASE}-${process.env.VITEST_POOL_ID || process.env.JEST_WORKER_ID || '1'}`
    : process.env.APPLICATION_DB_DATABASE!;

const sequelize = new Sequelize({
  dialect: PostgresDialect,
  pgModule: pg,
  host: process.env.APPLICATION_DB_HOST,
  user: process.env.APPLICATION_DB_USERNAME,
  password: process.env.APPLICATION_DB_PASSWORD,
  database: databaseName,
  port: Number(process.env.APPLICATION_DB_PORT),
  models,
  pool: process.env.NODE_ENV === 'test' ? { max: 50, min: 0, evict: 10_000 } : { max: 50, min: 5, evict: 60_000 },
  logging: process.env.DB_QUERY_LOGGING === 'true' ? console.log : false,
});

// Most models generate their UUID primary key via a per-row @BeforeCreate hook,
// but that hook fires too late under Sequelize v7: validation (which enforces the
// NOT NULL primary key) runs before beforeCreate, and bulkCreate skips per-row
// create hooks altogether. Assign the uuidv7 id here instead — in beforeValidate
// (runs before validation; covers create()/save()) and in beforeBulkCreate (covers
// bulkCreate) — so single and bulk inserts produce the same time-ordered ids.
// Integer ids and composite primary keys (whose columns are always caller-provided)
// are left untouched.
const assignUuidPrimaryKeyIfMissing = (instance: Model) => {
  const definition = instance.modelDefinition;
  if (!definition.primaryKeysAttributeNames.has('id')) return;
  const idAttribute = definition.attributes.get('id');
  if (idAttribute?.type instanceof DataTypes.UUID && instance.get('id') == null) {
    instance.set('id', uuidv7() as RecordId);
  }
};

sequelize.beforeValidate((instance) => assignUuidPrimaryKeyIfMissing(instance));
sequelize.beforeBulkCreate((instances) => {
  for (const instance of instances) assignUuidPrimaryKeyIfMissing(instance);
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
