import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  FINANCIAL_DATA_GUIDE_CONTENT,
  FINANCIAL_DATA_GUIDE_DESCRIPTION,
  FINANCIAL_DATA_GUIDE_NAME,
} from './prompts/financial-data-guide';
import { registerAddTransactionsToBudget } from './tools/add-transactions-to-budget';
import { registerAddTransactionsToGroup } from './tools/add-transactions-to-group';
import { registerAdjustAccountBalance } from './tools/adjust-account-balance';
import { registerArchiveAccount } from './tools/archive-account';
import { registerArchiveBudget } from './tools/archive-budget';
import { registerAssignTagsToTransaction } from './tools/assign-tags-to-transaction';
import { registerBulkUpdateTransactions } from './tools/bulk-update-transactions';
import { registerCreateBudget } from './tools/create-budget';
import { registerCreateCategory } from './tools/create-category';
import { registerCreateInvestmentTransaction } from './tools/create-investment-transaction';
import { registerCreatePortfolio } from './tools/create-portfolio';
import { registerCreateSubscription } from './tools/create-subscription';
import { registerCreateTag } from './tools/create-tag';
import { registerCreateTransaction } from './tools/create-transaction';
import { registerCreateTransactionGroup } from './tools/create-transaction-group';
import { registerDeleteBudget } from './tools/delete-budget';
import { registerDeleteCategory } from './tools/delete-category';
import { registerDeleteInvestmentTransaction } from './tools/delete-investment-transaction';
import { registerDeletePortfolio } from './tools/delete-portfolio';
import { registerDeleteSplit } from './tools/delete-split';
import { registerDeleteSubscription } from './tools/delete-subscription';
import { registerDeleteTag } from './tools/delete-tag';
import { registerDeleteTransaction } from './tools/delete-transaction';
import { registerDeleteTransactionGroup } from './tools/delete-transaction-group';
import { registerDetectSubscriptionCandidates } from './tools/detect-subscription-candidates';
import { registerDismissSubscriptionCandidate } from './tools/dismiss-subscription-candidate';
import { registerGetAccounts } from './tools/get-accounts';
import { registerGetBalanceHistory } from './tools/get-balance-history';
import { registerGetBudgetSpendingStats } from './tools/get-budget-spending-stats';
import { registerGetBudgets } from './tools/get-budgets';
import { registerGetCashFlow } from './tools/get-cash-flow';
import { registerGetCategories } from './tools/get-categories';
import { registerGetExpensesForPeriod } from './tools/get-expenses-for-period';
import { registerGetInvestmentTransactions } from './tools/get-investment-transactions';
import { registerGetPortfolioBalances } from './tools/get-portfolio-balances';
import { registerGetPortfolioHoldings } from './tools/get-portfolio-holdings';
import { registerGetPortfolioSummary } from './tools/get-portfolio-summary';
import { registerGetPortfolios } from './tools/get-portfolios';
import { registerGetSpendingByCategories } from './tools/get-spending-by-categories';
import { registerGetSubscriptionById } from './tools/get-subscription-by-id';
import { registerGetSubscriptions } from './tools/get-subscriptions';
import { registerGetSubscriptionsSummary } from './tools/get-subscriptions-summary';
import { registerGetTags } from './tools/get-tags';
import { registerGetTransactionGroups } from './tools/get-transaction-groups';
import { registerGetUpcomingSubscriptionPayments } from './tools/get-upcoming-subscription-payments';
import { registerGetUserProfile } from './tools/get-user-profile';
import { registerLinkRefund } from './tools/link-refund';
import { registerLinkTransactionsToSubscription } from './tools/link-transactions-to-subscription';
import { registerLinkTransfer } from './tools/link-transfer';
import { registerListSubscriptionCandidates } from './tools/list-subscription-candidates';
import { registerRemoveTagsFromTransaction } from './tools/remove-tags-from-transaction';
import { registerRemoveTransactionsFromBudget } from './tools/remove-transactions-from-budget';
import { registerRemoveTransactionsFromGroup } from './tools/remove-transactions-from-group';
import { registerSearchSecurities } from './tools/search-securities';
import { registerSearchTransactions } from './tools/search-transactions';
import { registerSplitTransaction } from './tools/split-transaction';
import { registerToggleSubscriptionActive } from './tools/toggle-subscription-active';
import { registerUnlinkRefund } from './tools/unlink-refund';
import { registerUnlinkTransactionsFromSubscription } from './tools/unlink-transactions-from-subscription';
import { registerUnlinkTransfer } from './tools/unlink-transfer';
import { registerUpdateBudget } from './tools/update-budget';
import { registerUpdateCategory } from './tools/update-category';
import { registerUpdateInvestmentTransaction } from './tools/update-investment-transaction';
import { registerUpdatePortfolio } from './tools/update-portfolio';
import { registerUpdateSubscription } from './tools/update-subscription';
import { registerUpdateTag } from './tools/update-tag';
import { registerUpdateTransaction } from './tools/update-transaction';
import { registerUpdateTransactionGroup } from './tools/update-transaction-group';

/**
 * Creates a new MCP server instance with all tools and prompts registered.
 * Each MCP session gets its own server instance.
 *
 * When adding, removing, or renaming tools / prompts, also update:
 *   packages/frontend/public/.well-known/mcp/server-card.json
 * The drift test at ./server-card-drift.unit.ts will fail otherwise.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'MoneyMatter Finance Tracker',
      version: '1.0.0',
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  // Register the financial data guide prompt
  server.prompt(FINANCIAL_DATA_GUIDE_NAME, FINANCIAL_DATA_GUIDE_DESCRIPTION, () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: FINANCIAL_DATA_GUIDE_CONTENT,
        },
      },
    ],
  }));

  // Profile & accounts
  registerGetUserProfile(server);
  registerGetAccounts(server);
  registerAdjustAccountBalance(server);
  registerArchiveAccount(server);

  // Transactions (read + CRUD + splits + refunds + transfer linking)
  registerSearchTransactions(server);
  registerCreateTransaction(server);
  registerUpdateTransaction(server);
  registerDeleteTransaction(server);
  registerBulkUpdateTransactions(server);
  registerSplitTransaction(server);
  registerDeleteSplit(server);
  registerLinkRefund(server);
  registerUnlinkRefund(server);
  registerLinkTransfer(server);
  registerUnlinkTransfer(server);

  // Taxonomy (categories + tags)
  registerGetCategories(server);
  registerCreateCategory(server);
  registerUpdateCategory(server);
  registerDeleteCategory(server);
  registerGetTags(server);
  registerCreateTag(server);
  registerUpdateTag(server);
  registerDeleteTag(server);
  registerAssignTagsToTransaction(server);
  registerRemoveTagsFromTransaction(server);

  // Budgets
  registerGetBudgets(server);
  registerCreateBudget(server);
  registerUpdateBudget(server);
  registerDeleteBudget(server);
  registerArchiveBudget(server);
  registerAddTransactionsToBudget(server);
  registerRemoveTransactionsFromBudget(server);
  registerGetBudgetSpendingStats(server);

  // Analytics
  registerGetSpendingByCategories(server);
  registerGetCashFlow(server);
  registerGetBalanceHistory(server);
  registerGetExpensesForPeriod(server);

  // Investments
  registerGetPortfolios(server);
  registerGetPortfolioSummary(server);
  registerGetPortfolioHoldings(server);
  registerGetPortfolioBalances(server);
  registerGetInvestmentTransactions(server);
  registerSearchSecurities(server);
  registerCreatePortfolio(server);
  registerUpdatePortfolio(server);
  registerDeletePortfolio(server);
  registerCreateInvestmentTransaction(server);
  registerUpdateInvestmentTransaction(server);
  registerDeleteInvestmentTransaction(server);

  // Transaction groups
  registerGetTransactionGroups(server);
  registerCreateTransactionGroup(server);
  registerUpdateTransactionGroup(server);
  registerDeleteTransactionGroup(server);
  registerAddTransactionsToGroup(server);
  registerRemoveTransactionsFromGroup(server);

  // Subscriptions
  registerGetSubscriptions(server);
  registerGetSubscriptionById(server);
  registerCreateSubscription(server);
  registerUpdateSubscription(server);
  registerDeleteSubscription(server);
  registerToggleSubscriptionActive(server);
  registerDetectSubscriptionCandidates(server);
  registerListSubscriptionCandidates(server);
  registerDismissSubscriptionCandidate(server);
  registerLinkTransactionsToSubscription(server);
  registerUnlinkTransactionsFromSubscription(server);
  registerGetUpcomingSubscriptionPayments(server);
  registerGetSubscriptionsSummary(server);

  return server;
}
