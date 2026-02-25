import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { listBanksByCountry } from '@root/services/bank-data-providers/enablebanking/aspsp.service';
import { z } from 'zod';

const schema = z.object({
  query: z.object({
    country: z.string().length(2, 'Country code must be 2 letters (ISO 3166-1 alpha-2)'),
  }),
  body: z.object({
    appId: z.string().min(1, 'Application ID is required'),
    privateKey: z.string().min(1, 'Private key is required'),
  }),
});

/**
 * POST /api/bank-data-providers/enablebanking/banks?country=FI
 * Get list of banks for a specific country
 */
export default createController(schema, async ({ query, body }) => {
  try {
    const banks = await listBanksByCountry(
      {
        appId: body.appId,
        privateKey: body.privateKey,
      },
      query.country.toUpperCase(),
    );

    return {
      data: { banks },
    };
  } catch {
    throw new ValidationError({ message: t({ key: 'bankDataProviders.failedToFetchBanks' }) });
  }
});
