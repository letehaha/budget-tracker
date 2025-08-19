import { ASSET_CLASS, SECURITY_PROVIDER, SecuritySearchResult } from '@bt/shared/types/investments';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { createHolding } from '@services/investments/holdings/create-holding.service';
import { deleteHolding } from '@services/investments/holdings/delete-holding.service';
import { getHoldings } from '@services/investments/holdings/get-holdings.service';
import { addSecurityFromSearch } from '@services/investments/securities/add-from-search.service';
import { z } from 'zod';

// Zod schema for SecuritySearchResult (matching the shared type)
const SecuritySearchResultSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  assetClass: z.nativeEnum(ASSET_CLASS),
  providerName: z.nativeEnum(SECURITY_PROVIDER),
  exchangeAcronym: z.string().optional(),
  exchangeMic: z.string().optional(),
  exchangeName: z.string().optional(),
  currencyCode: z.string(),
  cusip: z.string().optional(),
  isin: z.string().optional(),
}) satisfies z.ZodType<SecuritySearchResult>;

export const createHoldingController = createController(
  z.object({
    body: z
      .object({
        portfolioId: recordId(),
      })
      .and(
        z.union([
          z.object({ securityId: recordId(), searchResult: z.undefined() }),
          z.object({ securityId: z.undefined(), searchResult: SecuritySearchResultSchema }),
        ]),
      ),
  }),
  async ({ user, body }) => {
    const { id: userId } = user;
    const { portfolioId, securityId, searchResult } = body;

    let finalSecurityId = securityId;

    // If searchResult is provided, create the security first
    if (searchResult) {
      const { security } = await addSecurityFromSearch({ searchResult });
      finalSecurityId = security.id;
    }

    if (!finalSecurityId) {
      throw new Error('No securityId available after processing request');
    }

    const holding = await createHolding({ userId, portfolioId, securityId: finalSecurityId });
    return { data: holding, statusCode: 201 };
  },
);

export const getHoldingsController = createController(
  z.object({
    params: z.object({ portfolioId: recordId() }),
    query: z.object({
      securityId: recordId().optional(),
      date: z
        .string()
        .optional()
        .transform((val) => (val ? new Date(val) : undefined)),
    }),
  }),
  async ({ user, params, query }) => {
    const holdings = await getHoldings({
      userId: user.id,
      portfolioId: params.portfolioId,
      securityId: query.securityId,
      date: query.date,
    });

    return { data: holdings };
  },
);

export const deleteHoldingController = createController(
  z.object({
    body: z.object({ portfolioId: recordId(), securityId: recordId() }),
  }),
  async ({ user, body }) => {
    const { id: userId } = user;
    const { portfolioId, securityId } = body;
    await deleteHolding({ userId, portfolioId, securityId });
    return { statusCode: 200 };
  },
);
