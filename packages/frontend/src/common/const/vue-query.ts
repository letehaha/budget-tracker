export const VUE_QUERY_GLOBAL_PREFIXES = Object.freeze({
  // This query might be added to other queries so that on transcation create/edit
  // we can call for invalidating all the queries that include that particular one
  transactionChange: 'global-query-tx-change',

  // When security price is changed, dashboard and many security-related hooks should
  // be invalidated
  securityPriceChange: 'global-query-security-price-change',
});

const { transactionChange, securityPriceChange } = VUE_QUERY_GLOBAL_PREFIXES;

export const VUE_QUERY_CACHE_KEYS = Object.freeze({
  // widget balance trend
  widgetBalanceTrend: [transactionChange, securityPriceChange, 'widget-balance-trend'],
  widgetBalanceTotalBalance: [transactionChange, securityPriceChange, 'widget-balance-total-balance'],
  widgetBalancePreviousBalance: [transactionChange, securityPriceChange, 'widget-balance-previous-balance'],

  // widget expenses structure
  widgetExpensesStructureTotal: [transactionChange, 'widget-expenses-structure-total'],
  widgetExpensesStructureCurrentAmount: [transactionChange, 'widget-expenses-structure-current-amount'],
  widgetExpensesStructurePrevAmount: [transactionChange, 'widget-expenses-structure-prev-amount'],

  // widget latest records
  widgetLatestRecords: [transactionChange, 'widget-latest-records'],

  // others
  analyticsBalanceHistoryTrend: [transactionChange, securityPriceChange, 'analytics-balance-history-trend'],

  recordsPageRecordsList: [transactionChange, 'records-page-records-list'],

  recordsPageTransactionList: [transactionChange, 'records-page'],

  accountSpecificTransactions: [transactionChange, 'account-transactions'],

  allAccounts: [transactionChange, securityPriceChange, 'all-accounts'],

  accountGroupForAccount: ['account-group-for-account'],

  exchangeRates: ['exchange-rates'],
  accountGroups: [transactionChange, 'account-groups'],

  budgetsList: ['budgets-list'],
  budgetsListItem: ['budgets-list-item'],
  budgetTransactionList: [transactionChange, 'budget-transaction-list'],
  budgetAddingTransactionList: [transactionChange, 'budget-adding-transaction-list'],
  budgetStats: [transactionChange, 'budget-stats'],

  /**
   * Investments
   */

  // portfolios
  portfoliosList: [securityPriceChange, 'portfolios'],
  portfolioDetails: [securityPriceChange, 'portfolio-details'],
  portfolioTransfers: [securityPriceChange, 'portfolio-transfers'],
  portfolioSummary: [securityPriceChange, 'portfolio-summary'],

  // holdings
  holdingsList: [securityPriceChange, 'holdings'],
  holdingTransactions: [securityPriceChange, 'holding-transactions'],
});
