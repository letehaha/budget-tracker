import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUser, getUserBaseCurrency, getUserCurrencies } from '@services/user.service';

import { getUserId, jsonContent } from './helpers';

export function registerGetUserProfile(server: McpServer) {
  server.tool(
    'get_user_profile',
    "Get the user's base currency, configured currencies with exchange rates, and basic profile info. Call this first to understand the user's currency context.",
    {},
    async (_args, extra) => {
      const userId = getUserId({ extra });
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
