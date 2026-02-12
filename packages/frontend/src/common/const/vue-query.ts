/**
 * Cache duration constants for Vue Query staleTime and gcTime.
 * Financial data doesn't change frequently, so longer cache times are appropriate.
 */
export const QUERY_CACHE_STALE_TIME = {
  /** 5 minutes - for data that changes infrequently (analytics, stats) */
  ANALYTICS: 5 * 60 * 1000,
} as const;

export const VUE_QUERY_GLOBAL_PREFIXES = Object.freeze({
  // This query might be added to other queries so that on transcation create/edit
  // we can call for invalidating all the queries that include that particular one
  transactionChange: 'global-query-tx-change',

  // When security price is changed, dashboard and many security-related hooks should
  // be invalidated
  securityPriceChange: 'global-query-security-price-change',

  // When bank connection changes (link/unlink/disconnect), all bank connection related
  // queries should be invalidated
  bankConnectionChange: 'global-query-bank-connection-change',

  currencies: 'currencies',

  notifications: 'notifications',
});

const { transactionChange, securityPriceChange, bankConnectionChange, notifications } = VUE_QUERY_GLOBAL_PREFIXES;

export const VUE_QUERY_CACHE_KEYS = Object.freeze({
  // currencies
  allCurrencies: [VUE_QUERY_GLOBAL_PREFIXES.currencies, 'all'] as const,
  userCurrencies: [VUE_QUERY_GLOBAL_PREFIXES.currencies, 'user'] as const,
  baseCurrency: [VUE_QUERY_GLOBAL_PREFIXES.currencies, 'base'] as const,

  // widget balance trend
  widgetBalanceTrend: [transactionChange, securityPriceChange, 'widget-balance-trend'] as const,
  widgetBalanceTrendPrev: [transactionChange, securityPriceChange, 'widget-balance-trend-prev'] as const,
  widgetBalanceTotalBalance: [transactionChange, securityPriceChange, 'widget-balance-total-balance'] as const,
  widgetBalancePreviousBalance: [transactionChange, securityPriceChange, 'widget-balance-previous-balance'] as const,

  // widget expenses structure
  widgetExpensesStructureTotal: [transactionChange, 'widget-expenses-structure-total'] as const,
  widgetExpensesStructureCurrentAmount: [transactionChange, 'widget-expenses-structure-current-amount'] as const,
  widgetExpensesStructurePrevAmount: [transactionChange, 'widget-expenses-structure-prev-amount'] as const,

  // widget latest records
  widgetLatestRecords: [transactionChange, 'widget-latest-records'] as const,

  // analytics
  analyticsBalanceHistoryTrend: [transactionChange, securityPriceChange, 'analytics-balance-history-trend'] as const,
  analyticsCashFlow: [transactionChange, 'analytics-cash-flow'] as const,
  analyticsCumulative: [transactionChange, 'analytics-cumulative'] as const,
  analyticsSpendingsByCategories: [transactionChange, 'analytics-spendings-by-categories'] as const,

  recordsPageRecordsList: [transactionChange, 'records-page-records-list'] as const,

  recordsPageTransactionList: [transactionChange, 'records-page'] as const,

  accountSpecificTransactions: [transactionChange, 'account-transactions'] as const,

  allAccounts: [transactionChange, securityPriceChange, 'all-accounts'] as const,

  accountGroupForAccount: ['account-group-for-account'] as const,

  exchangeRates: ['exchange-rates'] as const,
  accountGroups: [transactionChange, 'account-groups'] as const,

  budgetsList: ['budgets-list'] as const,
  budgetsListItem: ['budgets-list-item'] as const,
  budgetTransactionList: [transactionChange, 'budget-transaction-list'] as const,
  budgetAddingTransactionList: [transactionChange, 'budget-adding-transaction-list'] as const,
  budgetStats: [transactionChange, 'budget-stats'] as const,

  /**
   * Investments
   */

  // portfolios
  portfoliosList: [securityPriceChange, 'portfolios'] as const,
  portfolioDetails: [securityPriceChange, 'portfolio-details'] as const,
  portfolioTransfers: [securityPriceChange, 'portfolio-transfers'] as const,
  portfolioSummary: [securityPriceChange, 'portfolio-summary'] as const,

  // holdings
  holdingsList: [securityPriceChange, 'holdings'] as const,
  holdingTransactions: [securityPriceChange, 'holding-transactions'] as const,

  // bank integrations
  bankProviders: [bankConnectionChange, 'bank-providers'] as const,
  bankConnectionDetails: [bankConnectionChange, 'bank-connection-details'] as const,
  bankAvailableExternalAccounts: [bankConnectionChange, 'bank-available-external-accounts'] as const,
  bankConnections: [bankConnectionChange, 'bank-connections'] as const,

  // notifications
  notificationsList: [notifications, 'notifications-list'] as const,
  notificationsUnreadCount: [notifications, 'notifications-unread-count'] as const,

  // subscriptions
  subscriptionsList: [transactionChange, 'subscriptions-list'] as const,
  subscriptionDetails: [transactionChange, 'subscription-details'] as const,
  subscriptionsSummary: [transactionChange, 'subscriptions-summary'] as const,
  widgetSubscriptionsUpcoming: [transactionChange, 'widget-subscriptions-upcoming'] as const,
  subscriptionCandidates: ['subscription-candidates'] as const,
});
