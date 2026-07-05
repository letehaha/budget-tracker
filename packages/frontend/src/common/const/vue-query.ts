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

  // When venture deals/events change, combined-balance-history (and other
  // venture-aware queries) need to refresh.
  ventureChange: 'global-query-venture-change',

  currencies: 'currencies',

  notifications: 'notifications',
});

const { transactionChange, securityPriceChange, bankConnectionChange, ventureChange, notifications } =
  VUE_QUERY_GLOBAL_PREFIXES;

export const VUE_QUERY_CACHE_KEYS = Object.freeze({
  // currencies
  allCurrencies: [VUE_QUERY_GLOBAL_PREFIXES.currencies, 'all'] as const,
  userCurrencies: [VUE_QUERY_GLOBAL_PREFIXES.currencies, 'user'] as const,
  baseCurrency: [VUE_QUERY_GLOBAL_PREFIXES.currencies, 'base'] as const,
  // append the yyyy-MM-dd date when using
  exchangeRatesForDate: [VUE_QUERY_GLOBAL_PREFIXES.currencies, 'rates-for-date'] as const,

  // widget balance trend
  widgetBalanceTrend: [transactionChange, securityPriceChange, ventureChange, 'widget-balance-trend'] as const,
  widgetBalanceTrendPrev: [transactionChange, securityPriceChange, ventureChange, 'widget-balance-trend-prev'] as const,
  widgetBalanceTotalBalance: [
    transactionChange,
    securityPriceChange,
    ventureChange,
    'widget-balance-total-balance',
  ] as const,
  widgetBalancePreviousBalance: [
    transactionChange,
    securityPriceChange,
    ventureChange,
    'widget-balance-previous-balance',
  ] as const,

  // widget expenses structure
  widgetExpensesStructureTotal: [transactionChange, 'widget-expenses-structure-total'] as const,
  widgetExpensesStructureCurrentAmount: [transactionChange, 'widget-expenses-structure-current-amount'] as const,
  widgetExpensesStructurePrevAmount: [transactionChange, 'widget-expenses-structure-prev-amount'] as const,

  // widget latest records
  widgetLatestRecords: [transactionChange, 'widget-latest-records'] as const,
  widgetLatestRecordsScheduled: [transactionChange, 'widget-latest-records-scheduled'] as const,

  // widget category spending tracker
  widgetCategorySpendingTracker: [transactionChange, 'widget-category-spending-tracker'] as const,

  // widget cash flow
  widgetCashFlow: [transactionChange, 'widget-cash-flow'] as const,
  widgetCashFlowPrev: [transactionChange, 'widget-cash-flow-prev'] as const,
  widgetCashFlowTrend: [transactionChange, 'widget-cash-flow-trend'] as const,

  // analytics
  analyticsBalanceHistoryTrend: [
    transactionChange,
    securityPriceChange,
    ventureChange,
    'analytics-balance-history-trend',
  ] as const,
  analyticsCashFlow: [transactionChange, 'analytics-cash-flow'] as const,
  analyticsPivotReport: [transactionChange, 'analytics-pivot-report'] as const,
  analyticsCumulative: [transactionChange, 'analytics-cumulative'] as const,
  analyticsSpendingsByCategories: [transactionChange, 'analytics-spendings-by-categories'] as const,
  earliestTransactionDate: [transactionChange, 'earliest-transaction-date'] as const,

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
  budgetSpendingStats: [transactionChange, 'budget-spending-stats'] as const,
  budgetCategoryTransactions: [transactionChange, 'budget-category-transactions'] as const,

  /**
   * Investments
   */

  // portfolios
  portfoliosList: [securityPriceChange, 'portfolios'] as const,
  portfoliosTrashList: [securityPriceChange, 'portfolios-trash'] as const,
  portfolioDetails: [securityPriceChange, 'portfolio-details'] as const,
  portfolioTransfers: [securityPriceChange, 'portfolio-transfers'] as const,
  portfolioSummary: [securityPriceChange, 'portfolio-summary'] as const,
  portfolioAnnualizedReturns: [securityPriceChange, 'portfolio-annualized-returns'] as const,
  portfolioBalances: [securityPriceChange, 'portfolio-balances'] as const,
  transactionPortfolioLink: [transactionChange, 'transaction-portfolio-link'] as const,

  portfolioInvestmentTransactions: [securityPriceChange, 'portfolio-investment-transactions'] as const,

  // holdings
  holdingsList: [securityPriceChange, 'holdings'] as const,
  holdingTransactions: [securityPriceChange, 'holding-transactions'] as const,

  // transactions import (AI-parsed)
  investmentImportSecuritySearch: ['investment-import', 'security-search'] as const,

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
  recordsUpcomingPayments: [transactionChange, 'records-upcoming-payments'] as const,
  subscriptionCandidates: ['subscription-candidates'] as const,

  // transaction groups
  transactionGroupsList: [transactionChange, 'transaction-groups-list'] as const,
  transactionGroupDetail: [transactionChange, 'transaction-group-detail'] as const,

  // optimizations
  bulkTransferScan: [transactionChange, 'bulk-transfer-scan'] as const,

  // vehicles
  vehiclesList: [transactionChange, 'vehicles-list'] as const,
  vehicleDetail: [transactionChange, 'vehicle-detail'] as const,
  vehicleOverrideHistory: [transactionChange, 'vehicle-override-history'] as const,

  // loans
  loansList: [transactionChange, 'loans-list'] as const,
  loanDetail: [transactionChange, 'loan-detail'] as const,
  loanRecentPayments: [transactionChange, 'loan-recent-payments'] as const,
  loanAllPayments: [transactionChange, 'loan-all-payments'] as const,
  loanBalanceHistory: [transactionChange, 'loan-balance-history'] as const,

  // user settings
  userSettings: ['user-settings'] as const,

  // MCP connected apps
  mcpConnectedApps: ['mcp-connected-apps'] as const,

  // AI settings
  aiApiKeyStatus: ['ai-settings', 'api-keys'] as const,
  aiFeaturesStatus: ['ai-settings', 'features'] as const,
  aiCustomInstructions: ['ai-settings', 'custom-instructions'] as const,

  // sharing
  shareInvitationsSent: ['share', 'invitations-sent'] as const,
  shareInvitationsReceived: ['share', 'invitations-received'] as const,
  shareMembers: ['share', 'members'] as const,
  sharedWithMe: ['share', 'shared-with-me'] as const,

  // categories
  categoriesByAccount: ['categories-by-account'] as const,

  // payees
  payeesList: ['payees-list'] as const,
  payeesByAccount: ['payees-by-account'] as const,
  payeeById: ['payee-by-id'] as const,
  payeesIgnoredNames: ['payees-ignored-names'] as const,
  payeeTransactionsDialog: [transactionChange, 'payee-tx-dialog'] as const,

  // brand logos – shared by payee + subscription logo pickers.
  // append the search term when using
  brandLogoSearch: ['brand-logo-search'] as const,

  // venture
  venturePlatformsList: [ventureChange, 'venture-platforms-list'] as const,
  ventureDealsList: [ventureChange, 'venture-deals-list'] as const,
  ventureDealDetails: [ventureChange, 'venture-deal-details'] as const,
  ventureDealMetrics: [ventureChange, 'venture-deal-metrics'] as const,
  ventureDealEvents: [ventureChange, 'venture-deal-events'] as const,
});
