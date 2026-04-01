import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  FINANCIAL_DATA_GUIDE_CONTENT,
  FINANCIAL_DATA_GUIDE_DESCRIPTION,
  FINANCIAL_DATA_GUIDE_NAME,
} from './prompts/financial-data-guide';
import { registerGetAccounts } from './tools/get-accounts';
import { registerGetBalanceHistory } from './tools/get-balance-history';
import { registerGetBudgets } from './tools/get-budgets';
import { registerGetCashFlow } from './tools/get-cash-flow';
import { registerGetCategories } from './tools/get-categories';
import { registerGetExpensesForPeriod } from './tools/get-expenses-for-period';
import { registerGetSpendingByCategories } from './tools/get-spending-by-categories';
import { registerGetTags } from './tools/get-tags';
import { registerGetUserProfile } from './tools/get-user-profile';
import { registerSearchTransactions } from './tools/search-transactions';

/**
 * Creates a new MCP server instance with all tools and prompts registered.
 * Each MCP session gets its own server instance.
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

  // Register all MCP tools
  registerGetUserProfile(server);
  registerGetAccounts(server);
  registerSearchTransactions(server);
  registerGetCategories(server);
  registerGetTags(server);
  registerGetBudgets(server);
  registerGetSpendingByCategories(server);
  registerGetCashFlow(server);
  registerGetBalanceHistory(server);
  registerGetExpensesForPeriod(server);

  return server;
}
