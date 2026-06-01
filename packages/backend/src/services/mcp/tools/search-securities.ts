import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchSecurities } from '@services/investments/securities/search.service';
import { z } from 'zod';

import { getUserId, jsonContent } from './helpers';

export function registerSearchSecurities(server: McpServer) {
  server.registerTool(
    'search_securities',
    {
      description:
        'Search for securities (stocks, ETFs, crypto, etc.) by ticker symbol or company name. Call this before create_investment_transaction to resolve a human-readable ticker (e.g. "AAPL") into a securityId. If portfolioId is provided, each result includes isInPortfolio to indicate whether the security is already tracked in that portfolio.',
      inputSchema: {
        query: z.string().describe('Ticker symbol or company name to search for (e.g. "AAPL", "Apple")'),
        portfolioId: z
          .string()
          .uuid()
          .optional()
          .describe('Portfolio ID to annotate results with isInPortfolio flag (from get_portfolios)'),
        limit: z.number().optional().describe('Maximum number of results to return (default: 20)'),
      },
    },
    async (args, extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'search_securities', clientId: extra.authInfo?.clientId });

      const results = await searchSecurities({
        query: args.query,
        limit: args.limit,
        portfolioId: args.portfolioId,
        user: { id: userId } as any,
      });

      // Drop provider routing keys (providerName/providerSymbol — not accepted by
      // any MCP tool), regulatory ids (cusip/isin, usually null), and UI-only hints
      // (logoUrl, matchType, exchange MIC/acronym).
      const slimmed = results.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        assetClass: r.assetClass,
        currencyCode: r.currencyCode,
        exchangeName: r.exchangeName,
        marketCapRank: r.marketCapRank,
        isInPortfolio: r.isInPortfolio,
      }));

      return jsonContent({ data: slimmed });
    },
  );
}
