import { trackMcpToolUsed } from '@js/utils/posthog';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUser, getUserBaseCurrency, getUserCurrencies } from '@services/user.service';

import { getUserId, jsonContent } from './helpers';

export function registerGetUserProfile(server: McpServer) {
  server.registerTool(
    'get_user_profile',
    {
      description:
        "Get the user's base currency, configured currencies with exchange rates, and basic profile info. Call this first to understand the user's currency context.",
    },
    async (extra) => {
      const userId = getUserId({ extra });
      trackMcpToolUsed({ userId, tool: 'get_user_profile', clientId: extra.authInfo?.clientId });
      const [user, baseCurrency, currencies] = await Promise.all([
        getUser(userId),
        getUserBaseCurrency({ userId }),
        getUserCurrencies({ userId }),
      ]);

      return jsonContent({
        data: {
          username: user?.username ?? null,
          baseCurrency: baseCurrency ? { code: baseCurrency.currencyCode } : null,
          currencies: currencies.map((c) => ({
            code: c.currencyCode,
            exchangeRate: c.exchangeRate,
            isDefaultCurrency: c.isDefaultCurrency,
          })),
        },
      });
    },
  );
}
